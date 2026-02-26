/*
Where: src/main/infrastructure/frontmost-app-focus-client.ts
What: Best-effort macOS frontmost-app snapshot/restore helper for temporary UI flows.
Why: Profile picker popups should return focus to the previously frontmost app after close.
*/

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const escapeAppleScriptString = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

export class FrontmostAppFocusClient {
  private readonly runCommand: typeof execFileAsync
  private readonly platform: NodeJS.Platform

  constructor(options?: { runCommand?: typeof execFileAsync; platform?: NodeJS.Platform }) {
    this.runCommand = options?.runCommand ?? execFileAsync
    this.platform = options?.platform ?? process.platform
  }

  async captureFrontmostBundleId(): Promise<string | null> {
    if (this.platform !== 'darwin') {
      return null
    }

    const { stdout } = await this.runCommand('osascript', [
      '-e',
      'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
    ])
    const bundleId = stdout.trim()
    return bundleId.length > 0 ? bundleId : null
  }

  async activateBundleId(bundleId: string): Promise<void> {
    const trimmedBundleId = bundleId.trim()
    if (this.platform !== 'darwin' || trimmedBundleId.length === 0) {
      return
    }

    await this.runCommand('osascript', [
      '-e',
      `tell application id "${escapeAppleScriptString(trimmedBundleId)}" to activate`
    ])
  }
}

