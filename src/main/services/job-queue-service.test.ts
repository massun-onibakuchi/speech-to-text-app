import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobQueueService } from './job-queue-service'

const tempDirs: string[] = []

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'stt-queue-test-'))
  tempDirs.push(dir)
  return dir
}

const waitFor = async (condition: () => boolean, timeoutMs = 2000): Promise<void> => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('JobQueueService', () => {
  it('processes back-to-back completed captures without dropping jobs', async () => {
    const dir = makeTempDir()
    const journalPath = join(dir, 'queue', 'journal.json')
    const service = new JobQueueService({ journalPath })

    const capturedAt = new Date().toISOString()
    service.enqueueCapture({
      jobId: 'job-1',
      audioFilePath: '/tmp/audio-1.wav',
      capturedAt
    })
    service.enqueueCapture({
      jobId: 'job-2',
      audioFilePath: '/tmp/audio-2.wav',
      capturedAt
    })

    await waitFor(() => service.getJournalSnapshot().every((job) => job.terminalStatus !== null))

    const jobs = service.getJournalSnapshot()
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.jobId)).toEqual(['job-1', 'job-2'])
    expect(jobs.every((job) => job.terminalStatus === 'succeeded')).toBe(true)
  })

  it('replays non-terminal jobs from journal on startup', async () => {
    const dir = makeTempDir()
    const queueDir = join(dir, 'queue')
    const journalPath = join(queueDir, 'journal.json')
    mkdirSync(queueDir, { recursive: true })

    writeFileSync(
      journalPath,
      JSON.stringify(
        {
          version: 1,
          jobs: [
            {
              jobId: 'replay-job',
              audioFilePath: '/tmp/replay.wav',
              capturedAt: new Date().toISOString(),
              processingState: 'queued',
              terminalStatus: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )

    const service = new JobQueueService({ journalPath })
    await waitFor(() => service.getJournalSnapshot().every((job) => job.terminalStatus !== null))

    const [job] = service.getJournalSnapshot()
    expect(job.jobId).toBe('replay-job')
    expect(job.terminalStatus).toBe('succeeded')
  })

  it('replays jobs left in transcribing state after crash', async () => {
    const dir = makeTempDir()
    const queueDir = join(dir, 'queue')
    const journalPath = join(queueDir, 'journal.json')
    mkdirSync(queueDir, { recursive: true })

    writeFileSync(
      journalPath,
      JSON.stringify(
        {
          version: 1,
          jobs: [
            {
              jobId: 'recovering-job',
              audioFilePath: '/tmp/recovering.wav',
              capturedAt: new Date().toISOString(),
              processingState: 'transcribing',
              terminalStatus: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )

    const service = new JobQueueService({ journalPath })
    await waitFor(() => service.getJournalSnapshot().every((job) => job.terminalStatus !== null))

    const [job] = service.getJournalSnapshot()
    expect(job.jobId).toBe('recovering-job')
    expect(job.terminalStatus).toBe('succeeded')
  })

  it('sets transcription_failed terminal status exactly once when processor throws', async () => {
    const dir = makeTempDir()
    const journalPath = join(dir, 'queue', 'journal.json')
    const processor = vi.fn(async () => {
      throw new Error('boom')
    })
    const service = new JobQueueService({ journalPath, processor })

    service.enqueueCapture({
      jobId: 'job-fail',
      audioFilePath: '/tmp/fail.wav',
      capturedAt: new Date().toISOString()
    })

    await waitFor(() => service.getJournalSnapshot().every((job) => job.terminalStatus !== null))

    const [job] = service.getJournalSnapshot()
    expect(job.terminalStatus).toBe('transcription_failed')
    expect(processor).toHaveBeenCalledTimes(1)
  })
})
