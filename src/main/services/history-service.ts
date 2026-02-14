import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, fsyncSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { TerminalJobStatus } from '../../shared/domain'

export interface HistoryRecord {
  jobId: string
  capturedAt: string
  transcriptText: string | null
  transformedText: string | null
  terminalStatus: TerminalJobStatus
  createdAt: string
}

interface HistoryStore {
  version: 1
  records: HistoryRecord[]
}

export class HistoryService {
  private readonly historyPath: string

  constructor(historyPath?: string) {
    this.historyPath = historyPath ?? join(app.getPath('userData'), 'history', 'records.json')
  }

  appendRecord(record: HistoryRecord): void {
    const store = this.loadStore()
    store.records.unshift(record)
    this.persistStore(store)
  }

  getRecords(): HistoryRecord[] {
    return this.loadStore().records
  }

  private loadStore(): HistoryStore {
    if (!existsSync(this.historyPath)) {
      return { version: 1, records: [] }
    }

    const content = readFileSync(this.historyPath, 'utf8')
    const parsed = JSON.parse(content) as HistoryStore
    return {
      version: 1,
      records: parsed.records ?? []
    }
  }

  private persistStore(store: HistoryStore): void {
    const dirPath = dirname(this.historyPath)
    mkdirSync(dirPath, { recursive: true })

    const tempPath = `${this.historyPath}.${process.pid}.tmp`
    writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8')

    const fileFd = openSync(tempPath, 'r')
    try {
      fsyncSync(fileFd)
    } finally {
      closeSync(fileFd)
    }

    renameSync(tempPath, this.historyPath)

    const dirFd = openSync(dirPath, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  }
}
