import { afterEach, describe, expect, it, vi } from 'vitest'
import { PasteAutomationClient } from './paste-automation-client'

const originalPlatform = process.platform

const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true
  })
}

afterEach(() => {
  setPlatform(originalPlatform)
  delete process.env.PLAYWRIGHT_BYPASS_ACCESSIBILITY
})

describe('PasteAutomationClient', () => {
  it('skips native paste automation when the Playwright bypass env is enabled', async () => {
    setPlatform('linux')
    process.env.PLAYWRIGHT_BYPASS_ACCESSIBILITY = '1'
    const runCommand = vi.fn()

    const client = new PasteAutomationClient(runCommand as any)
    await expect(client.pasteAtCursor()).resolves.toBeUndefined()

    expect(runCommand).not.toHaveBeenCalled()
  })

  it('runs osascript command on macOS', async () => {
    setPlatform('darwin')
    const runCommand = vi.fn(async () => ({ stdout: '', stderr: '' }))

    const client = new PasteAutomationClient(runCommand as any)
    await client.pasteAtCursor()

    expect(runCommand).toHaveBeenCalledWith('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down'
    ])
  })

  it('throws on non-macOS platforms', async () => {
    setPlatform('linux')
    const client = new PasteAutomationClient(vi.fn() as any)

    await expect(client.pasteAtCursor()).rejects.toThrow('only supported on macOS')
  })
})
