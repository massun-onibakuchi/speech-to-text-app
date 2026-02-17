import type { OutputRule, TerminalJobStatus } from '../../shared/domain'
import { ClipboardClient } from '../infrastructure/clipboard-client'
import { PasteAutomationClient } from '../infrastructure/paste-automation-client'
import { PermissionService } from './permission-service'

export class OutputService {
  private readonly clipboardClient: ClipboardClient
  private readonly pasteAutomationClient: PasteAutomationClient
  private readonly permissionService: PermissionService
  private lastOutputMessage: string | null = null

  constructor(options?: {
    clipboardClient?: ClipboardClient
    pasteAutomationClient?: PasteAutomationClient
    permissionService?: PermissionService
  }) {
    this.clipboardClient = options?.clipboardClient ?? new ClipboardClient()
    this.pasteAutomationClient = options?.pasteAutomationClient ?? new PasteAutomationClient()
    this.permissionService = options?.permissionService ?? new PermissionService()
  }

  async applyOutput(text: string, rule: OutputRule): Promise<TerminalJobStatus> {
    this.lastOutputMessage = null

    if (!rule.copyToClipboard && !rule.pasteAtCursor) {
      return 'succeeded'
    }

    // Always write to clipboard when paste is enabled, even if copyToClipboard
    // is false. Paste automation works via Cmd+V which reads the system clipboard,
    // so the text must be there before pasting. When copyToClipboard is false,
    // the "copy" user-visible semantic is suppressed but the clipboard write is
    // still required as an implementation detail of paste automation.
    if (rule.copyToClipboard || rule.pasteAtCursor) {
      this.clipboardClient.writeText(text)
    }

    if (!rule.pasteAtCursor) {
      return 'succeeded'
    }

    const permission = this.permissionService.getAccessibilityPermissionStatus()
    if (!permission.granted) {
      this.lastOutputMessage = permission.guidance
      return 'output_failed_partial'
    }

    try {
      await this.pasteAutomationClient.pasteAtCursor()
      return 'succeeded'
    } catch {
      this.lastOutputMessage = 'Paste automation failed while applying output.'
      return 'output_failed_partial'
    }
  }

  getLastOutputMessage(): string | null {
    return this.lastOutputMessage
  }
}
