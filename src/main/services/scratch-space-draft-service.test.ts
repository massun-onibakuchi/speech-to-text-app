/**
 * Where: src/main/services/scratch-space-draft-service.test.ts
 * What:  Tests for scratch-space draft persistence and corrupted-file recovery.
 * Why:   The popup draft must survive close/reopen safely without poisoning startup.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { ScratchSpaceDraftService } from './scratch-space-draft-service'

describe('ScratchSpaceDraftService', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  const makeDraftPath = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'scratch-space-draft-'))
    tempDirs.push(dir)
    return join(dir, 'draft.json')
  }

  it('persists and reloads the draft text', () => {
    const draftPath = makeDraftPath()
    const service = new ScratchSpaceDraftService(draftPath)

    service.saveDraft('hello from scratch space')

    const reloaded = new ScratchSpaceDraftService(draftPath)
    expect(reloaded.getDraft()).toBe('hello from scratch space')
  })

  it('clears the draft by persisting an empty string', () => {
    const draftPath = makeDraftPath()
    const service = new ScratchSpaceDraftService(draftPath)

    service.saveDraft('temporary draft')
    service.clearDraft()

    expect(service.getDraft()).toBe('')
    expect(readFileSync(draftPath, 'utf8')).toContain('"draft": ""')
  })

  it('backs up corrupted payloads and falls back to an empty draft', () => {
    const draftPath = makeDraftPath()
    writeFileSync(draftPath, '{not-json', 'utf8')

    const service = new ScratchSpaceDraftService(draftPath)

    expect(service.getDraft()).toBe('')
  })
})
