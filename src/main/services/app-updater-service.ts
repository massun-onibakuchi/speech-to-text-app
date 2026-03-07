/**
 * Where: src/main/services/app-updater-service.ts
 * What:  GitHub Releases auto-update orchestration with prompt-before-download behavior.
 * Why:   Keep update logic out of the lifecycle bootstrap while making release checks testable.
 */

import { app, dialog } from 'electron'
import { autoUpdater, type AppUpdater, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater'
import { logStructured } from '../../shared/error-logging'

type MessageBox = Pick<typeof dialog, 'showMessageBox'>

const DOWNLOAD_BUTTON_INDEX = 0
const INSTALL_BUTTON_INDEX = 0

export class AppUpdaterService {
  private readonly updater: AppUpdater
  private readonly messageBox: MessageBox
  private isChecking = false
  private isDownloading = false
  private listenersRegistered = false

  constructor(
    options: {
      updater?: AppUpdater
      messageBox?: MessageBox
    } = {}
  ) {
    this.updater = options.updater ?? autoUpdater
    this.messageBox = options.messageBox ?? dialog
  }

  start(): void {
    if (!app.isPackaged) {
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'updater.skipped_unpacked',
        message: 'Skipping release update check because the app is not packaged.'
      })
      return
    }

    if (this.isChecking) {
      return
    }

    this.registerListeners()
    this.isChecking = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true

    void this.updater.checkForUpdates()
      .catch((error) => {
        logStructured({
          level: 'error',
          scope: 'main',
          event: 'updater.check_failed',
          message: 'Failed to check for updates from GitHub Releases.',
          error
        })
      })
      .finally(() => {
        this.isChecking = false
      })
  }

  private registerListeners(): void {
    if (this.listenersRegistered) {
      return
    }

    this.listenersRegistered = true
    this.updater.on('checking-for-update', () => {
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'updater.checking',
        message: 'Checking GitHub Releases for a newer build.'
      })
    })

    this.updater.on('update-not-available', () => {
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'updater.no_update',
        message: 'No newer release is available.'
      })
    })

    this.updater.on('update-available', (info) => {
      void this.promptToDownloadUpdate(info).catch((error) => {
        this.logPromptFailure('updater.download_prompt_failed', 'Failed to show the update download prompt.', error)
      })
    })

    this.updater.on('update-downloaded', (event) => {
      void this.promptToInstallUpdate(event).catch((error) => {
        this.logPromptFailure('updater.install_prompt_failed', 'Failed to show the update install prompt.', error)
      })
    })

    this.updater.on('error', (error) => {
      logStructured({
        level: 'error',
        scope: 'main',
        event: 'updater.runtime_error',
        message: 'Electron updater emitted an error.',
        error
      })
      this.isDownloading = false
    })
  }

  private async promptToDownloadUpdate(info: UpdateInfo): Promise<void> {
    if (this.isDownloading) {
      return
    }

    logStructured({
      level: 'info',
      scope: 'main',
      event: 'updater.update_available',
      message: 'A newer release is available.',
      context: { version: info.version }
    })

    const result = await this.messageBox.showMessageBox({
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: DOWNLOAD_BUTTON_INDEX,
      cancelId: 1,
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      detail: 'Download the new release now? The app will prompt again when it is ready to install.'
    })

    if (result.response !== DOWNLOAD_BUTTON_INDEX) {
      return
    }

    this.isDownloading = true
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      logStructured({
        level: 'error',
        scope: 'main',
        event: 'updater.download_failed',
        message: 'Failed to download the selected update.',
        error,
        context: { version: info.version }
      })
      this.isDownloading = false
    }
  }

  private async promptToInstallUpdate(event: UpdateDownloadedEvent): Promise<void> {
    this.isDownloading = false
    logStructured({
      level: 'info',
      scope: 'main',
      event: 'updater.update_downloaded',
      message: 'An update finished downloading and is ready to install.',
      context: { version: event.version }
    })

    const result = await this.messageBox.showMessageBox({
      type: 'info',
      buttons: ['Restart and Install', 'Later'],
      defaultId: INSTALL_BUTTON_INDEX,
      cancelId: 1,
      title: 'Install Update',
      message: `Version ${event.version} has been downloaded.`,
      detail: 'Restart the app now to install the update.'
    })

    if (result.response === INSTALL_BUTTON_INDEX) {
      this.updater.quitAndInstall()
    }
  }

  private logPromptFailure(event: string, message: string, error: unknown): void {
    logStructured({
      level: 'error',
      scope: 'main',
      event,
      message,
      error
    })
  }
}
