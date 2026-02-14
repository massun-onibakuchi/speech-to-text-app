import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from '../ipc/register-handlers'
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
  }
}
