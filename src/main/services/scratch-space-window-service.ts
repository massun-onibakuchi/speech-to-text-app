/**
 * Where: src/main/services/scratch-space-window-service.ts
 * What:  Dedicated floating-window controller for scratch-space entry and paste targeting.
 * Why:   The popup needs a reusable always-on-top utility window and must remember
 *        which app was frontmost before opening so execution can paste back there.
 */

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'

interface ScratchSpaceWindowServiceDependencies {
  create: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow
  focusClient: Pick<FrontmostAppFocusClient, 'captureFrontmostBundleId'>
}

export class ScratchSpaceWindowService {
  private readonly createWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow
  private readonly focusClient: Pick<FrontmostAppFocusClient, 'captureFrontmostBundleId'>
  private scratchWindow: BrowserWindow | null = null
  private isQuitting = false
  private targetBundleId: string | null = null

  constructor(dependencies?: Partial<ScratchSpaceWindowServiceDependencies>) {
    this.createWindow = dependencies?.create ?? ((options) => new BrowserWindow(options))
    this.focusClient = dependencies?.focusClient ?? new FrontmostAppFocusClient()
  }

  markQuitting(): void {
    this.isQuitting = true
  }

  async show(options?: { captureTarget?: boolean }): Promise<void> {
    const win = this.ensureWindow()
    const shouldCaptureTarget =
      options?.captureTarget !== false && (!win.isVisible() || !this.targetBundleId)
    if (shouldCaptureTarget) {
      this.targetBundleId = await this.focusClient.captureFrontmostBundleId()
    }

    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
    this.sendOpenEvent(win)
  }

  hide(): void {
    this.scratchWindow?.hide()
  }

  getTargetBundleId(): string | null {
    return this.targetBundleId
  }

  clearTargetBundleId(): void {
    this.targetBundleId = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.scratchWindow) {
      return this.scratchWindow
    }

    const titlebarOptions = process.platform === 'darwin'
      ? {
          backgroundColor: '#111318'
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#111318',
            symbolColor: '#e6edf3',
            height: 38
          },
          backgroundColor: '#111318'
        }

    this.scratchWindow = this.createWindow({
      width: 620,
      height: 460,
      minWidth: 560,
      minHeight: 420,
      maxWidth: 860,
      show: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      ...titlebarOptions,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.scratchWindow.on('close', (event) => {
      if (this.isQuitting) {
        return
      }
      event.preventDefault()
      this.scratchWindow?.hide()
    })

    this.scratchWindow.on('closed', () => {
      this.scratchWindow = null
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.scratchWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=scratch-space`)
    } else {
      void this.scratchWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: {
          window: 'scratch-space'
        }
      })
    }

    return this.scratchWindow
  }

  private sendOpenEvent(win: BrowserWindow): void {
    if (win.webContents.isLoadingMainFrame()) {
      win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.onOpenScratchSpace)
        }
      })
      return
    }

    win.webContents.send(IPC_CHANNELS.onOpenScratchSpace)
  }
}
