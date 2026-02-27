// src/main/infrastructure/selection-client.ts
// Reads the currently selected text from the frontmost macOS application.
// Uses the Cmd+C clipboard hack: saves clipboard, simulates Cmd+C via osascript,
// polls for clipboard change, restores original clipboard content.
// Mirrors PasteAutomationClient (Cmd+V) — this is the symmetric read counterpart.
// See specs/h1-spike-run-transformation-on-selection.md for design rationale.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ClipboardClient } from './clipboard-client'

const execFileAsync = promisify(execFile)

/** Delay before issuing Cmd+C to allow global-shortcut modifier keys to settle. */
const DEFAULT_COPY_SETTLE_DELAY_MS = 80

/** Default maximum time (ms) to wait for clipboard content to change after Cmd+C. */
const DEFAULT_POLL_TIMEOUT_MS = 220

/** Interval (ms) between clipboard polls. */
const POLL_INTERVAL_MS = 5

/** Prefix for temporary clipboard probe values used to detect Cmd+C changes reliably. */
const CLIPBOARD_PROBE_PREFIX = '__speech_to_text_selection_probe__'

export class SelectionClient {
  private readonly clipboard: ClipboardClient
  private readonly runCommand: typeof execFileAsync
  private readonly copySettleDelayMs: number
  private readonly pollTimeoutMs: number
  private readonly platform: NodeJS.Platform

  constructor(options: {
    clipboard: ClipboardClient
    runCommand?: typeof execFileAsync
    copySettleDelayMs?: number
    pollTimeoutMs?: number
    platform?: NodeJS.Platform
  }) {
    this.clipboard = options.clipboard
    this.runCommand = options.runCommand ?? execFileAsync
    this.copySettleDelayMs = options.copySettleDelayMs ?? DEFAULT_COPY_SETTLE_DELAY_MS
    this.pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
    this.platform = options.platform ?? process.platform
  }

  /**
   * Reads the currently selected text from the frontmost macOS application.
   * Returns null if no text is selected or the clipboard didn't change.
   * Restores the original clipboard content after reading.
   */
  async readSelection(): Promise<string | null> {
    if (this.platform !== 'darwin') {
      return null
    }

    const saved = this.clipboard.readText()
    const probe = `${CLIPBOARD_PROBE_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    try {
      // Seed clipboard with a probe token so Cmd+C detection still works when
      // selected text equals the previously copied clipboard content.
      this.clipboard.writeText(probe)

      // Global shortcut callbacks can run before users release modifier keys.
      // Waiting briefly reduces Cmd+Opt+K => Cmd+Opt+C overlap during selection copy.
      await this.sleep(this.copySettleDelayMs)

      // Simulate Cmd+C in the frontmost app via System Events
      await this.runCommand('osascript', [
        '-e',
        'tell application "System Events" to keystroke "c" using command down'
      ])

      // Poll clipboard for a change (indicates Cmd+C succeeded)
      return await this.pollForChange(probe)
    } finally {
      // Restore original clipboard content (best-effort, text-only)
      this.clipboard.writeText(saved)
    }
  }

  /**
   * Polls the clipboard until content differs from `previousContent` or timeout.
   * Returns the new clipboard text, or null if no change detected.
   */
  private async pollForChange(previousContent: string): Promise<string | null> {
    const deadline = Date.now() + this.pollTimeoutMs

    while (Date.now() < deadline) {
      const current = this.clipboard.readText()
      if (current !== previousContent) {
        return current.trim().length > 0 ? current : null
      }
      await this.sleep(POLL_INTERVAL_MS)
    }

    return null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
