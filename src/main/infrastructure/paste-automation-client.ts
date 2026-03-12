import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const E2E_ACCESSIBILITY_BYPASS_ENV = 'PLAYWRIGHT_BYPASS_ACCESSIBILITY'

export class PasteAutomationClient {
  private readonly runCommand: typeof execFileAsync

  constructor(runCommand?: typeof execFileAsync) {
    this.runCommand = runCommand ?? execFileAsync
  }

  async pasteAtCursor(): Promise<void> {
    if (process.env[E2E_ACCESSIBILITY_BYPASS_ENV] === '1') {
      return
    }

    if (process.platform !== 'darwin') {
      throw new Error('Paste automation is only supported on macOS.')
    }

    await this.runCommand('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down'
    ])
  }
}
