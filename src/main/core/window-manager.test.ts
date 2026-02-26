/**
 * Where: src/main/core/window-manager.test.ts
 * What:  Tests WindowManager tray/background close behavior.
 * Why:   Guard against destroying the renderer on window close, which breaks recording shortcuts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type WindowListener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  const windowListeners = new Map<string, WindowListener>()
  const hide = vi.fn()
  const loadURL = vi.fn()
  const loadFile = vi.fn()
  const isMinimized = vi.fn(() => false)
  const restore = vi.fn()
  const show = vi.fn()
  const focus = vi.fn()
  const on = vi.fn((event: string, listener: WindowListener) => {
    windowListeners.set(event, listener)
  })

  const browserWindowInstance = {
    on,
    hide,
    loadURL,
    loadFile,
    isMinimized,
    restore,
    show,
    focus
  }
  const BrowserWindow = vi.fn(() => browserWindowInstance)

  const trayOn = vi.fn()
  const traySetToolTip = vi.fn()
  const traySetContextMenu = vi.fn()
  const Tray = vi.fn(() => ({
    setToolTip: traySetToolTip,
    setContextMenu: traySetContextMenu,
    on: trayOn
  }))

  const appDockHide = vi.fn()
  const appDockShow = vi.fn()

  return {
    windowListeners,
    hide,
    loadURL,
    loadFile,
    isMinimized,
    restore,
    show,
    focus,
    on,
    BrowserWindow,
    trayOn,
    traySetToolTip,
    traySetContextMenu,
    Tray,
    Menu: { buildFromTemplate: vi.fn(() => ({ template: true })) },
    nativeImage: { createEmpty: vi.fn(() => ({})) },
    app: { dock: { hide: appDockHide, show: appDockShow } },
    appDockHide,
    appDockShow
  }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  Tray: mocks.Tray,
  Menu: mocks.Menu,
  nativeImage: mocks.nativeImage,
  app: mocks.app
}))

import { WindowManager } from './window-manager'

describe('WindowManager', () => {
  beforeEach(() => {
    mocks.windowListeners.clear()
    vi.clearAllMocks()
    delete process.env.ELECTRON_RENDERER_URL
  })

  it('hides the main window instead of closing it when user closes the window', () => {
    const manager = new WindowManager()
    manager.createMainWindow()

    const onClose = mocks.windowListeners.get('close')
    expect(onClose).toBeTypeOf('function')

    const preventDefault = vi.fn()
    onClose?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(mocks.hide).toHaveBeenCalledOnce()
  })

  it('allows the window to close during explicit app quit', () => {
    const manager = new WindowManager()
    manager.createMainWindow()
    manager.markQuitting()

    const onClose = mocks.windowListeners.get('close')
    expect(onClose).toBeTypeOf('function')

    const preventDefault = vi.fn()
    onClose?.({ preventDefault })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(mocks.hide).not.toHaveBeenCalled()
  })
})
