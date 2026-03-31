/**
 * Where: src/main/services/scratch-space-window-service.ts
 * What:  Dedicated floating-window controller for scratch-space entry and paste targeting.
 * Why:   The popup needs a reusable always-on-top utility window and must remember
 *        which app was frontmost before opening so execution can paste back there.
 */

import { BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'

// Matches the renderer `bg-background` token (`oklch(0.13 0.005 260)`) so native
// title-bar chrome and the web contents read as one continuous surface.
const SCRATCH_SPACE_WINDOW_BACKGROUND = '#060709'
const SCRATCH_SPACE_WINDOW_TITLEBAR_SYMBOL_COLOR = '#e6edf3'
const SCRATCH_SPACE_WINDOW_TITLEBAR_OVERLAY_HEIGHT = 38
const SCRATCH_SPACE_CLOSE_ACCELERATOR = 'Escape'
const SCRATCH_SPACE_WINDOW_DIMENSIONS = {
  width: 620,
  height: 460,
  minWidth: 560,
  minHeight: 420,
  maxWidth: 860
} as const

interface ScratchSpaceWindowServiceDependencies {
  create: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow
  focusClient: Pick<FrontmostAppFocusClient, 'captureFrontmostBundleId'>
  globalShortcut: Pick<typeof globalShortcut, 'isRegistered' | 'register' | 'unregister'>
}

export class ScratchSpaceWindowService {
  private readonly createWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow
  private readonly focusClient: Pick<FrontmostAppFocusClient, 'captureFrontmostBundleId'>
  private readonly globalShortcut: Pick<typeof globalShortcut, 'isRegistered' | 'register' | 'unregister'>
  private scratchWindow: BrowserWindow | null = null
  private isQuitting = false
  private targetBundleId: string | null = null
  private closeShortcutRegistered = false

  constructor(dependencies?: Partial<ScratchSpaceWindowServiceDependencies>) {
    this.createWindow = dependencies?.create ?? ((options) => new BrowserWindow(options))
    this.focusClient = dependencies?.focusClient ?? new FrontmostAppFocusClient()
    this.globalShortcut = dependencies?.globalShortcut ?? globalShortcut
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
    this.showWindowWithoutTakingFrontmostApp(win)
    this.registerCloseShortcutIfNeeded()
    this.sendOpenEvent(win)
  }

  hide(): void {
    this.unregisterCloseShortcutIfNeeded()
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

    this.scratchWindow = this.createWindow({
      ...SCRATCH_SPACE_WINDOW_DIMENSIONS,
      show: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      ...this.buildTitlebarOptions(),
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
      this.hide()
    })

    this.scratchWindow.on('closed', () => {
      this.unregisterCloseShortcutIfNeeded()
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

  private buildTitlebarOptions(): Electron.BrowserWindowConstructorOptions {
    if (process.platform === 'darwin') {
      return {
        type: 'panel',
        backgroundColor: SCRATCH_SPACE_WINDOW_BACKGROUND
      }
    }

    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: SCRATCH_SPACE_WINDOW_BACKGROUND,
        symbolColor: SCRATCH_SPACE_WINDOW_TITLEBAR_SYMBOL_COLOR,
        height: SCRATCH_SPACE_WINDOW_TITLEBAR_OVERLAY_HEIGHT
      },
      backgroundColor: SCRATCH_SPACE_WINDOW_BACKGROUND
    }
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

  private showWindowWithoutTakingFrontmostApp(win: BrowserWindow): void {
    if (process.platform === 'darwin') {
      win.showInactive()
      return
    }

    win.show()
    win.focus()
  }

  private registerCloseShortcutIfNeeded(): void {
    if (process.platform !== 'darwin') {
      return
    }

    if (this.closeShortcutRegistered) {
      return
    }

    const registered = this.globalShortcut.register(SCRATCH_SPACE_CLOSE_ACCELERATOR, () => {
      if (this.scratchWindow?.isVisible()) {
        this.hide()
      }
    })
    this.closeShortcutRegistered = registered
  }

  private unregisterCloseShortcutIfNeeded(): void {
    if (process.platform !== 'darwin' || !this.closeShortcutRegistered) {
      return
    }

    this.globalShortcut.unregister(SCRATCH_SPACE_CLOSE_ACCELERATOR)
    this.closeShortcutRegistered = false
  }
}
