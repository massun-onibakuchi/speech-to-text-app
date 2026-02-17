import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryService } from './history-service'

const tempRoots: string[] = []

const createHistoryPath = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'history-service-test-'))
  tempRoots.push(root)
  return join(root, 'history', 'records.json')
}

describe('HistoryService', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0, tempRoots.length)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recovers gracefully when persisted history JSON is malformed', () => {
    const historyPath = createHistoryPath()
    mkdirSync(dirname(historyPath), { recursive: true })
    writeFileSync(historyPath, '{"version":1,"records":[', 'utf8')

    const service = new HistoryService(historyPath)
    const records = service.getRecords()

    expect(records).toEqual([])
    expect(existsSync(historyPath)).toBe(false)

    const parent = dirname(historyPath)
    const entries = readdirSync(parent)
    expect(entries.some((name) => /^records\.json\.corrupt\.\d+$/.test(name))).toBe(true)
  })

  it('can append a new record after recovering from malformed history JSON', () => {
    const historyPath = createHistoryPath()
    mkdirSync(dirname(historyPath), { recursive: true })
    writeFileSync(historyPath, 'not-json', 'utf8')
    const service = new HistoryService(historyPath)

    service.appendRecord({
      jobId: 'job-1',
      capturedAt: '2026-02-15T00:00:00.000Z',
      transcriptText: 'hello',
      transformedText: null,
      terminalStatus: 'succeeded',
      failureDetail: null,
      failureCategory: null,
      createdAt: '2026-02-15T00:00:00.000Z'
    })

    const content = readFileSync(historyPath, 'utf8')
    expect(() => JSON.parse(content)).not.toThrow()
    const records = service.getRecords()
    expect(records).toHaveLength(1)
    expect(records[0]?.jobId).toBe('job-1')
  })

  it('recovers when history JSON is valid but has invalid structure', () => {
    const historyPath = createHistoryPath()
    mkdirSync(dirname(historyPath), { recursive: true })
    writeFileSync(historyPath, JSON.stringify({ version: 1, records: 'invalid-shape' }), 'utf8')

    const service = new HistoryService(historyPath)
    const records = service.getRecords()

    expect(records).toEqual([])
    expect(existsSync(historyPath)).toBe(false)
    const parent = dirname(historyPath)
    const entries = readdirSync(parent)
    expect(entries.some((name) => /^records\.json\.corrupt\.\d+$/.test(name))).toBe(true)
  })
})
