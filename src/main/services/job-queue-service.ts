import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, fsyncSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { CaptureResult } from './capture-types'
import type { JobProcessingState, TerminalJobStatus } from '../../shared/domain'

export interface QueueJobRecord {
  jobId: string
  audioFilePath: string
  capturedAt: string
  processingState: JobProcessingState
  terminalStatus: TerminalJobStatus | null
  createdAt: string
  updatedAt: string
}

interface QueueJournal {
  version: 1
  jobs: QueueJobRecord[]
}

export type QueueProcessor = (job: QueueJobRecord) => Promise<TerminalJobStatus>

const isTerminal = (job: QueueJobRecord): boolean => job.terminalStatus !== null

const defaultQueueProcessor: QueueProcessor = async () => 'succeeded'

export class JobQueueService {
  private readonly journalPath: string
  private readonly processor: QueueProcessor
  private readonly queue: string[] = []
  private journal: QueueJournal = { version: 1, jobs: [] }
  private isProcessing = false

  constructor(options?: { journalPath?: string; processor?: QueueProcessor }) {
    this.journalPath = options?.journalPath ?? join(app.getPath('userData'), 'queue', 'journal.json')
    this.processor = options?.processor ?? defaultQueueProcessor
    this.initialize()
  }

  enqueueCapture(capture: CaptureResult): void {
    const now = new Date().toISOString()
    const record: QueueJobRecord = {
      jobId: capture.jobId,
      audioFilePath: capture.audioFilePath,
      capturedAt: capture.capturedAt,
      processingState: 'queued',
      terminalStatus: null,
      createdAt: now,
      updatedAt: now
    }

    this.journal.jobs.push(record)
    this.persistJournal()

    this.queue.push(record.jobId)
    void this.processQueue()
  }

  getJournalSnapshot(): ReadonlyArray<QueueJobRecord> {
    return structuredClone(this.journal.jobs)
  }

  private initialize(): void {
    this.loadJournal()

    const replayJobs = this.journal.jobs.filter((job) => !isTerminal(job)).map((job) => job.jobId)
    if (replayJobs.length > 0) {
      this.queue.push(...replayJobs)
      void this.processQueue()
    }
  }

  private loadJournal(): void {
    if (!existsSync(this.journalPath)) {
      this.journal = { version: 1, jobs: [] }
      return
    }

    const content = readFileSync(this.journalPath, 'utf8')
    const parsed = JSON.parse(content) as QueueJournal
    this.journal = {
      version: 1,
      jobs: parsed.jobs ?? []
    }
  }

  private persistJournal(): void {
    const dirPath = dirname(this.journalPath)
    mkdirSync(dirPath, { recursive: true })

    const tempPath = `${this.journalPath}.${process.pid}.tmp`
    writeFileSync(tempPath, JSON.stringify(this.journal, null, 2), 'utf8')

    const tempFd = openSync(tempPath, 'r')
    try {
      fsyncSync(tempFd)
    } finally {
      closeSync(tempFd)
    }

    renameSync(tempPath, this.journalPath)

    const dirFd = openSync(dirPath, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      while (this.queue.length > 0) {
        const jobId = this.queue.shift()
        if (!jobId) {
          continue
        }

        const job = this.journal.jobs.find((candidate) => candidate.jobId === jobId)
        if (!job || isTerminal(job)) {
          continue
        }

        try {
          this.updateProcessingState(jobId, 'transcribing')
          const terminalStatus = await this.processor(structuredClone(job))
          this.updateTerminalStatus(jobId, terminalStatus)
        } catch {
          this.updateTerminalStatus(jobId, 'transcription_failed')
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  private updateProcessingState(jobId: string, state: JobProcessingState): void {
    const job = this.journal.jobs.find((candidate) => candidate.jobId === jobId)
    if (!job || isTerminal(job)) {
      return
    }

    job.processingState = state
    job.updatedAt = new Date().toISOString()
    this.persistJournal()
  }

  private updateTerminalStatus(jobId: string, terminalStatus: TerminalJobStatus): void {
    const job = this.journal.jobs.find((candidate) => candidate.jobId === jobId)
    if (!job) {
      return
    }

    job.terminalStatus = terminalStatus
    job.updatedAt = new Date().toISOString()
    this.persistJournal()
  }
}
