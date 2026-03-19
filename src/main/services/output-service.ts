import type { OutputRule, TerminalJobStatus } from '../../shared/domain'
import { LOCAL_STREAMING_OUTPUT_RULE } from '../../shared/output-selection'
import { ClipboardClient } from '../infrastructure/clipboard-client'
import { PasteAutomationClient } from '../infrastructure/paste-automation-client'
import { PermissionService } from './permission-service'

const MAX_PASTE_ATTEMPTS = 2
const PASTE_RETRY_DELAY_MS = 150

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const LOCAL_STREAMING_OUTPUT_ABORT_MESSAGE = 'Local streaming output aborted.'

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error(LOCAL_STREAMING_OUTPUT_ABORT_MESSAGE)
  }
}

export interface OutputApplyResult {
  status: TerminalJobStatus
  message: string | null
}

export interface OutputApplyOptions {
  signal?: AbortSignal
}

export class OutputService {
  private readonly clipboardClient: ClipboardClient
  private readonly pasteAutomationClient: PasteAutomationClient
  private readonly permissionService: PermissionService
  private readonly waitFn: (ms: number) => Promise<void>
  private lastOutputMessage: string | null = null

  constructor(options?: {
    clipboardClient?: ClipboardClient
    pasteAutomationClient?: PasteAutomationClient
    permissionService?: PermissionService
    waitFn?: (ms: number) => Promise<void>
  }) {
    this.clipboardClient = options?.clipboardClient ?? new ClipboardClient()
    this.pasteAutomationClient = options?.pasteAutomationClient ?? new PasteAutomationClient()
    this.permissionService = options?.permissionService ?? new PermissionService()
    this.waitFn = options?.waitFn ?? wait
  }

  async applyOutput(text: string, rule: OutputRule): Promise<TerminalJobStatus> {
    const result = await this.applyOutputWithDetail(text, rule)
    return result.status
  }

  async applyLocalStreamingOutput(text: string, options?: OutputApplyOptions): Promise<OutputApplyResult> {
    return this.applyOutputWithDetail(text, LOCAL_STREAMING_OUTPUT_RULE, options)
  }

  async applyOutputWithDetail(
    text: string,
    rule: OutputRule,
    options?: OutputApplyOptions
  ): Promise<OutputApplyResult> {
    this.lastOutputMessage = null

    if (!rule.copyToClipboard && !rule.pasteAtCursor) {
      return { status: 'succeeded', message: null }
    }

    // Always write to clipboard when paste is enabled, even if copyToClipboard
    // is false. Paste automation works via Cmd+V which reads the system clipboard,
    // so the text must be there before pasting. When copyToClipboard is false,
    // the "copy" user-visible semantic is suppressed but the clipboard write is
    // still required as an implementation detail of paste automation.
    if (rule.copyToClipboard || rule.pasteAtCursor) {
      assertNotAborted(options?.signal)
      this.clipboardClient.writeText(text)
    }

    if (!rule.pasteAtCursor) {
      return { status: 'succeeded', message: null }
    }

    if (options?.signal) {
      await Promise.resolve()
      assertNotAborted(options.signal)
    }

    const permission = this.permissionService.getAccessibilityPermissionStatus()
    if (!permission.granted) {
      this.lastOutputMessage = permission.guidance
      return {
        status: 'output_failed_partial',
        message: permission.guidance
      }
    }

    let lastPasteError: Error | null = null
    for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt += 1) {
      assertNotAborted(options?.signal)
      try {
        await this.pasteAutomationClient.pasteAtCursor()
        assertNotAborted(options?.signal)
        return { status: 'succeeded', message: null }
      } catch (error) {
        lastPasteError = error instanceof Error ? error : new Error('Unknown paste automation error.')
        if (attempt < MAX_PASTE_ATTEMPTS) {
          await this.waitFn(PASTE_RETRY_DELAY_MS)
          assertNotAborted(options?.signal)
        }
      }
    }

    // At least one attempt has failed when this path is reached.
    const trimmedMessage = lastPasteError!.message.trim()
    const detail = trimmedMessage.length > 0 ? ` ${trimmedMessage}` : ''
    this.lastOutputMessage =
      `Paste automation failed after ${MAX_PASTE_ATTEMPTS} attempts.${detail}` +
      ' Verify Accessibility permission and the focused target app, then retry.'
    return {
      status: 'output_failed_partial',
      message: this.lastOutputMessage
    }
  }

  getLastOutputMessage(): string | null {
    return this.lastOutputMessage
  }
}
