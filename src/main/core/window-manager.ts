/**
 * Where: src/main/core/window-manager.ts
 * What:  Creates and controls the main window + tray integration for background usage.
 * Why:   Preserve a live renderer by hiding on user-close so recording shortcuts keep working.
 */

import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private isQuitting = false

  markQuitting(): void {
    this.isQuitting = true
  }

  createMainWindow(): BrowserWindow {
    if (this.mainWindow) {
      return this.mainWindow
    }

    this.mainWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      show: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.mainWindow.on('close', (event) => {
      if (this.isQuitting) {
        return
      }
      // In background/tray mode, keep the renderer alive so recording hotkeys still dispatch.
      event.preventDefault()
      this.mainWindow?.hide()
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return this.mainWindow
  }

  ensureTray(): void {
    if (this.tray) {
      return
    }

    const icon = nativeImage.createEmpty()
    this.tray = new Tray(icon)
    this.tray.setToolTip('Speech-to-Text v1')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show Window',
          click: () => this.showMainWindow()
        },
        {
          label: 'Hide Window',
          click: () => this.mainWindow?.hide()
        },
        { type: 'separator' },
        {
          label: 'Quit',
          role: 'quit'
        }
      ])
    )

    this.tray.on('click', () => {
      this.showMainWindow()
    })
  }

  showMainWindow(): void {
    const win = this.createMainWindow()
    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
  }
}
