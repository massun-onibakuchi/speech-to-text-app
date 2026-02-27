// src/main/infrastructure/selection-client.test.ts
// Tests for SelectionClient: Cmd+C clipboard hack for reading selected text.

import { describe, expect, it, vi } from 'vitest'
import { SelectionClient } from './selection-client'

// Stub clipboard that can simulate Cmd+C changing its content
const createClipboardStub = (initial: string) => {
  let content = initial
  return {
    readText: vi.fn(() => content),
    writeText: vi.fn((text: string) => {
      content = text
    }),
    /** Simulate external Cmd+C writing new content */
    simulateCopy: (text: string) => {
      content = text
    }
  }
}

// Stub execFileAsync that triggers clipboard change to simulate Cmd+C
const createExecStub = (clipboard: ReturnType<typeof createClipboardStub>, selectedText: string | null) => {
  return vi.fn(async () => {
    if (selectedText !== null) {
      clipboard.simulateCopy(selectedText)
    }
    // If null, clipboard stays unchanged (no selection)
    return { stdout: '', stderr: '' }
  })
}

describe('SelectionClient', () => {
  it('reads selected text via Cmd+C simulation', async () => {
    const clipboard = createClipboardStub('original clipboard')
    const exec = createExecStub(clipboard, 'selected text from app')

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 50,
      platform: 'darwin'
    })

    const result = await client.readSelection()

    expect(result).toBe('selected text from app')
    // Verify osascript was called with Cmd+C keystroke
    expect(exec).toHaveBeenCalledWith('osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down'
    ])
    // Verify clipboard was restored
    expect(clipboard.writeText).toHaveBeenCalledWith('original clipboard')
  })

  it('returns null when clipboard does not change (no selection)', async () => {
    const clipboard = createClipboardStub('existing content')
    const exec = createExecStub(clipboard, null)

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 20, // short timeout for test speed
      platform: 'darwin'
    })

    const result = await client.readSelection()

    expect(result).toBeNull()
    // Clipboard should still be restored
    expect(clipboard.writeText).toHaveBeenCalledWith('existing content')
  })

  it('reads selection even when selected text matches previous clipboard content', async () => {
    const clipboard = createClipboardStub('same text')
    const exec = createExecStub(clipboard, 'same text')

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 50,
      platform: 'darwin'
    })

    const result = await client.readSelection()
    expect(result).toBe('same text')
    expect(clipboard.writeText).toHaveBeenCalledWith('same text')
  })

  it('returns null when clipboard changes to whitespace only', async () => {
    const clipboard = createClipboardStub('original')
    const exec = createExecStub(clipboard, '   ')

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 20,
      platform: 'darwin'
    })

    const result = await client.readSelection()
    expect(result).toBeNull()
  })

  it('preserves selected text whitespace', async () => {
    const clipboard = createClipboardStub('original')
    const exec = createExecStub(clipboard, '  hello world  ')

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 50,
      platform: 'darwin'
    })

    const result = await client.readSelection()
    expect(result).toBe('  hello world  ')
  })

  it('restores clipboard even when osascript fails', async () => {
    const clipboard = createClipboardStub('precious content')
    const exec = vi.fn(async () => {
      throw new Error('osascript failed')
    })

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 20,
      platform: 'darwin'
    })

    await expect(client.readSelection()).rejects.toThrow('osascript failed')
    expect(clipboard.writeText).toHaveBeenCalledWith('precious content')
  })

  it('returns null on non-macOS without invoking osascript', async () => {
    const clipboard = createClipboardStub('original')
    const exec = createExecStub(clipboard, 'selected text from app')

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 20,
      platform: 'linux'
    })

    const result = await client.readSelection()
    expect(result).toBeNull()
    expect(exec).not.toHaveBeenCalled()
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('reads selection when clipboard update arrives after a short async delay', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboardStub('original')
    const exec = vi.fn(async () => {
      setTimeout(() => {
        clipboard.simulateCopy('delayed selected text')
      }, 120)
      return { stdout: '', stderr: '' }
    })

    const client = new SelectionClient({
      clipboard,
      runCommand: exec as any,
      copySettleDelayMs: 0,
      pollTimeoutMs: 300,
      platform: 'darwin'
    })

    try {
      const pending = client.readSelection()
      await vi.advanceTimersByTimeAsync(150)
      const result = await pending
      expect(result).toBe('delayed selected text')
      expect(clipboard.writeText).toHaveBeenCalledWith('original')
    } finally {
      vi.useRealTimers()
    }
  })
})
