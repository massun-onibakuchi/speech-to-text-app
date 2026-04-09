/**
 * Where: src/main/services/scratch-space-window-service.ts
 * What:  Dedicated floating-window controller for scratch-space entry and paste targeting.
 * Why:   The popup needs a reusable always-on-top utility window and must remember
 *        which app was frontmost before opening so execution can paste back there.
 */

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS, type ScratchSpaceOpenPayload } from '../../shared/ipc'
import { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'

// Matches the renderer `bg-background` token (`oklch(0.13 0.005 260)`) so native
// title-bar chrome and the web contents read as one continuous surface.
const SCRATCH_SPACE_WINDOW_BACKGROUND = '#060709'
const SCRATCH_SPACE_WINDOW_TITLEBAR_SYMBOL_COLOR = '#e6edf3'
const SCRATCH_SPACE_WINDOW_TITLEBAR_OVERLAY_HEIGHT = 38
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
}

export class ScratchSpaceWindowService {
  private readonly createWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow
  private readonly focusClient: Pick<FrontmostAppFocusClient, 'captureFrontmostBundleId'>
  private scratchWindow: BrowserWindow | null = null
  private isQuitting = false
  private targetBundleId: string | null = null
  private isRendererReady = false
  private pendingOpenPayload: ScratchSpaceOpenPayload | null = null
  private pendingPresetMenuOpen = false

  constructor(dependencies?: Partial<ScratchSpaceWindowServiceDependencies>) {
    this.createWindow = dependencies?.create ?? ((options) => new BrowserWindow(options))
    this.focusClient = dependencies?.focusClient ?? new FrontmostAppFocusClient()
  }

  markQuitting(): void {
    this.isQuitting = true
  }

  async show(options?: { captureTarget?: boolean; reason?: ScratchSpaceOpenPayload['reason'] }): Promise<void> {
    const win = this.ensureWindow()
    const shouldCaptureTarget =
      options?.captureTarget !== false && (!win.isVisible() || !this.targetBundleId)
    if (shouldCaptureTarget) {
      this.targetBundleId = await this.focusClient.captureFrontmostBundleId()
    }

    if (win.isMinimized()) {
      win.restore()
    }
    this.showWindowForTyping(win)
    this.sendOpenEvent(win, { reason: options?.reason ?? 'fresh' })
  }

  hide(): void {
    this.scratchWindow?.hide()
  }

  markRendererReady(): void {
    this.isRendererReady = true
    this.flushPendingRendererSignals()
  }

  openPresetMenuIfVisible(): boolean {
    if (!this.scratchWindow || this.scratchWindow.isDestroyed() || !this.scratchWindow.isVisible()) {
      return false
    }

    this.scratchWindow.focus()
    this.sendPresetMenuOpenEvent(this.scratchWindow)
    return true
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

    this.isRendererReady = false
    this.pendingOpenPayload = null
    this.pendingPresetMenuOpen = false

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
      this.isRendererReady = false
      this.pendingOpenPayload = null
      this.pendingPresetMenuOpen = false
      this.scratchWindow = null
    })

    this.scratchWindow.webContents.on('did-start-loading', () => {
      this.isRendererReady = false
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

  private sendOpenEvent(win: BrowserWindow, payload: ScratchSpaceOpenPayload): void {
    if (!this.isRendererSignalReady(win)) {
      this.pendingOpenPayload = payload
      return
    }

    win.webContents.send(IPC_CHANNELS.onOpenScratchSpace, payload)
  }

  private sendPresetMenuOpenEvent(win: BrowserWindow): void {
    if (!this.isRendererSignalReady(win)) {
      this.pendingPresetMenuOpen = true
      return
    }

    win.webContents.send(IPC_CHANNELS.onOpenScratchSpacePresetMenu)
  }

  private isRendererSignalReady(win: BrowserWindow): boolean {
    return !win.isDestroyed() && !win.webContents.isLoadingMainFrame() && this.isRendererReady
  }

  private flushPendingRendererSignals(): void {
    const win = this.scratchWindow
    if (!win || !this.isRendererSignalReady(win)) {
      return
    }

    if (this.pendingOpenPayload) {
      win.webContents.send(IPC_CHANNELS.onOpenScratchSpace, this.pendingOpenPayload)
      this.pendingOpenPayload = null
    }

    if (this.pendingPresetMenuOpen) {
      this.pendingPresetMenuOpen = false
      win.webContents.send(IPC_CHANNELS.onOpenScratchSpacePresetMenu)
    }
  }

  private showWindowForTyping(win: BrowserWindow): void {
    win.show()
    win.focus()
  }
}
