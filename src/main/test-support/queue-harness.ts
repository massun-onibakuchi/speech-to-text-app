// src/main/test-support/queue-harness.ts
// Reusable test harness for queue-based tests.
// Manages temp directories and provides async polling helpers.

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const createTempDir = (): string => mkdtempSync(join(tmpdir(), 'stt-test-'))

export const cleanupDirs = (dirs: string[]): void => {
  for (const dir of dirs.splice(0, dirs.length)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Polls `condition` every 10ms until it returns true or timeout expires. */
export const waitFor = async (condition: () => boolean, timeoutMs = 2000): Promise<void> => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
