/*
Where: src/renderer/vad-mic-debug-harness.test.tsx
What: Focused tests for the live mic VAD harness recovery behavior.
Why: Prevent regressions where fatal cleanup leaves the manual harness unable to restart.
*/

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroqBrowserVadCaptureOptions } from './groq-browser-vad-capture'

const { startGroqBrowserVadCapture } = vi.hoisted(() => ({
  startGroqBrowserVadCapture: vi.fn()
}))

vi.mock('./groq-browser-vad-capture', async () => ({
  startGroqBrowserVadCapture,
}))

import { VadMicDebugHarness } from './vad-mic-debug-harness'

const flush = async (): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => [])
    }
  })
  startGroqBrowserVadCapture.mockReset()
})

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('VadMicDebugHarness', () => {
  it('can start again after an internal fatal callback clears the stale capture ref', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    startGroqBrowserVadCapture
      .mockImplementationOnce(async (options: GroqBrowserVadCaptureOptions) => {
        const capture = {
          stop: vi.fn(async () => {}),
          cancel: vi.fn(async () => {})
        }
        setTimeout(() => {
          options.onFatalError(new Error('debug fatal'))
        }, 0)
        return capture
      })
      .mockImplementationOnce(async () => ({
        stop: vi.fn(async () => {}),
        cancel: vi.fn(async () => {})
      }))

    root.render(<VadMicDebugHarness />)
    await flush()

    const startButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Start listening'
    )
    if (!startButton) {
      throw new Error('Expected Start listening button to exist.')
    }

    startButton.click()
    await flush()
    await flush()

    expect(host.textContent).toContain('debug fatal')
    expect(startGroqBrowserVadCapture).toHaveBeenCalledTimes(1)

    startButton.click()
    await flush()

    expect(startGroqBrowserVadCapture).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Status: listening')
  })
})
