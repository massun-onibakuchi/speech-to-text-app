/**
 * Where: src/main/services/scratch-space-draft-service.ts
 * What:  Small persistence wrapper for the scratch-space draft text.
 * Why:   The popup must restore unfinished text across close/reopen cycles,
 *        but successful execution must clear that draft automatically.
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, fsyncSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

interface ScratchSpaceDraftStore {
  version: 1
  draft: string
}

export class ScratchSpaceDraftService {
  private readonly draftPath: string

  constructor(draftPath?: string) {
    this.draftPath = draftPath ?? join(app.getPath('userData'), 'scratch-space', 'draft.json')
  }

  getDraft(): string {
    return this.loadStore().draft
  }

  saveDraft(draft: string): void {
    this.persistStore({
      version: 1,
      draft
    })
  }

  clearDraft(): void {
    this.saveDraft('')
  }

  private loadStore(): ScratchSpaceDraftStore {
    if (!existsSync(this.draftPath)) {
      return { version: 1, draft: '' }
    }

    try {
      const content = readFileSync(this.draftPath, 'utf8')
      const parsed = JSON.parse(content) as unknown
      if (!this.isDraftStore(parsed)) {
        throw new Error('Invalid scratch draft payload.')
      }
      return parsed
    } catch {
      this.backupCorruptedStore()
      return { version: 1, draft: '' }
    }
  }

  private backupCorruptedStore(): void {
    try {
      const corruptedPath = `${this.draftPath}.corrupt.${Date.now()}`
      renameSync(this.draftPath, corruptedPath)
    } catch {
      // Keep scratch-space startup resilient even if backup fails.
    }
  }

  private persistStore(store: ScratchSpaceDraftStore): void {
    const dirPath = dirname(this.draftPath)
    mkdirSync(dirPath, { recursive: true })

    const tempPath = `${this.draftPath}.${process.pid}.tmp`
    writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8')

    const fileFd = openSync(tempPath, 'r')
    try {
      fsyncSync(fileFd)
    } finally {
      closeSync(fileFd)
    }

    renameSync(tempPath, this.draftPath)

    const dirFd = openSync(dirPath, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  }

  private isDraftStore(value: unknown): value is ScratchSpaceDraftStore {
    if (!value || typeof value !== 'object') {
      return false
    }

    const draft = (value as { draft?: unknown }).draft
    return typeof draft === 'string'
  }
}
