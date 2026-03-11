/**
 * Where: src/main/core/window-manager.ts
 * What:  Creates and controls the main window + tray integration for background usage.
 * Why:   Preserve a live renderer by hiding on user-close so recording shortcuts keep working.
 */

import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { logStructured } from '../../shared/error-logging'
import { IPC_CHANNELS } from '../../shared/ipc'
import { TRAY_ICON_PATHS } from '../infrastructure/tray-icon-path'

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

    const titlebarOptions = process.platform === 'darwin'
      ? {
          // Use hidden title bar on macOS so the upper-left app icon surface is removed.
          titleBarStyle: 'hidden' as const,
          backgroundColor: '#1a1a1f'
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#1a1a1f',
            symbolColor: '#f0f0f0',
            height: 40
          },
          backgroundColor: '#1a1a1f'
        }

    this.mainWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      show: true,
      ...titlebarOptions,
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
    this.mainWindow.webContents.on('console-message', (_event, _level, message) => {
      mirrorRendererStructuredLog(message)
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

    const icon = nativeImage.createFromPath(TRAY_ICON_PATHS.speechToText2x)
    if (icon.isEmpty()) {
      // Keep the app functional even if icon loading fails in a local environment.
      this.tray = new Tray(nativeImage.createEmpty())
    } else {
      icon.setTemplateImage(true)
      this.tray = new Tray(icon)
    }
    this.tray.setToolTip('Speech-to-Text v1')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Settings...',
          click: () => this.openSettingsFromTray()
        },
        { type: 'separator' },
        {
          label: 'Quit',
          role: 'quit'
        }
      ])
    )
  }

  showMainWindow(): void {
    const win = this.createMainWindow()
    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
  }

  private openSettingsFromTray(): void {
    const win = this.createMainWindow()
    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
    this.sendOpenSettingsEvent(win)
  }

  private sendOpenSettingsEvent(win: BrowserWindow): void {
    if (win.webContents.isLoadingMainFrame()) {
      win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.onOpenSettings)
        }
      })
      return
    }

    win.webContents.send(IPC_CHANNELS.onOpenSettings)
  }
}

const mirrorRendererStructuredLog = (message: string): void => {
  try {
    const parsed = JSON.parse(message) as {
      level?: unknown
      scope?: unknown
      event?: unknown
      message?: unknown
      context?: unknown
    }
    if (
      (parsed.level === 'info' || parsed.level === 'warn' || parsed.level === 'error') &&
      parsed.scope === 'renderer' &&
      typeof parsed.event === 'string'
    ) {
      logStructured({
        level: parsed.level,
        scope: 'renderer',
        event: parsed.event,
        message: typeof parsed.message === 'string' ? parsed.message : '',
        context: parsed.context && typeof parsed.context === 'object'
          ? parsed.context as Record<string, unknown>
          : {}
      })
    }
  } catch {
    // Ignore non-JSON console output from the renderer.
  }
}
