/**
 * Where: src/main/core/app-lifecycle.ts
 * What:  Main-process app lifecycle wiring (single instance, window/tray boot, quit cleanup).
 * Why:   Keep background tray + global shortcuts active when the main window is closed.
 */

import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers, unregisterGlobalHotkeys } from '../ipc/register-handlers'
import { WindowManager } from './window-manager'

export class AppLifecycle {
  private readonly windowManager = new WindowManager()

  initialize(): void {
    const singleInstance = app.requestSingleInstanceLock()
    if (!singleInstance) {
      app.quit()
      return
    }

    app.on('second-instance', () => {
      this.windowManager.showMainWindow()
    })

    app.whenReady().then(() => {
      app.setLoginItemSettings({ openAtLogin: true })
      registerIpcHandlers()
      this.windowManager.createMainWindow()
      this.windowManager.ensureTray()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.windowManager.createMainWindow()
        }
      })
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('before-quit', () => {
      this.windowManager.markQuitting()
    })

    app.on('will-quit', () => {
      unregisterGlobalHotkeys()
    })
  }
}
