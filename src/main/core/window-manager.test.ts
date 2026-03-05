/**
 * Where: src/main/core/window-manager.test.ts
 * What:  Tests WindowManager tray/background close behavior.
 * Why:   Guard against destroying the renderer on window close, which breaks recording shortcuts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'
import { TRAY_ICON_PATHS } from '../infrastructure/tray-icon-path'

type WindowListener = (...args: any[]) => void

type TrayListener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  const windowListeners = new Map<string, WindowListener>()
  const trayListeners = new Map<string, TrayListener>()

  const webContentsSend = vi.fn()
  const webContentsIsLoadingMainFrame = vi.fn(() => false)
  const webContentsOnce = vi.fn((event: string, listener: TrayListener) => {
    trayListeners.set(`webcontents:${event}`, listener)
  })

  const hide = vi.fn()
  const loadURL = vi.fn()
  const loadFile = vi.fn()
  const isMinimized = vi.fn(() => false)
  const isDestroyed = vi.fn(() => false)
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
    isDestroyed,
    restore,
    show,
    focus,
    webContents: {
      send: webContentsSend,
      isLoadingMainFrame: webContentsIsLoadingMainFrame,
      once: webContentsOnce
    }
  }
  const BrowserWindow = vi.fn(() => browserWindowInstance)

  const trayOn = vi.fn((event: string, listener: TrayListener) => {
    trayListeners.set(event, listener)
  })
  const traySetToolTip = vi.fn()
  const traySetContextMenu = vi.fn()
  const Tray = vi.fn(() => ({
    setToolTip: traySetToolTip,
    setContextMenu: traySetContextMenu,
    on: trayOn
  }))

  const trayIconImage = {
    isEmpty: vi.fn(() => false),
    setTemplateImage: vi.fn()
  }
  const emptyImage = {}
  const nativeImage = {
    createFromPath: vi.fn(() => trayIconImage),
    createEmpty: vi.fn(() => emptyImage)
  }

  const Menu = { buildFromTemplate: vi.fn((template: unknown[]) => ({ template })) }
  const app = { isPackaged: false }

  return {
    windowListeners,
    trayListeners,
    webContentsSend,
    webContentsIsLoadingMainFrame,
    webContentsOnce,
    hide,
    loadURL,
    loadFile,
    isMinimized,
    isDestroyed,
    restore,
    show,
    focus,
    on,
    BrowserWindow,
    trayOn,
    traySetToolTip,
    traySetContextMenu,
    Tray,
    Menu,
    trayIconImage,
    emptyImage,
    nativeImage,
    app
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
    mocks.trayListeners.clear()
    vi.clearAllMocks()
    delete process.env.ELECTRON_RENDERER_URL
  })

  describe('createMainWindow — macOS options', () => {
    it('sets custom titlebar options and backgroundColor on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
      try {
        const manager = new WindowManager()
        manager.createMainWindow()
        expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
        const firstCall = (mocks.BrowserWindow.mock.calls as unknown[][])[0]!
        const opts = firstCall[0] as Record<string, unknown>
        expect(opts.titleBarStyle).toBe('hiddenInset')
        expect(opts.trafficLightPosition).toEqual({ x: 13, y: 13 })
        expect(opts.backgroundColor).toBe('#1a1a1f')
      } finally {
        Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
      }
    })

    it('sets hidden titlebar overlay options on non-darwin', () => {
      // CI runs on linux; platform is already non-darwin — no stub needed.
      const manager = new WindowManager()
      manager.createMainWindow()
      expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
      const firstCall = (mocks.BrowserWindow.mock.calls as unknown[][])[0]!
      const opts = firstCall[0] as Record<string, unknown>
      expect(opts.titleBarStyle).toBe('hidden')
      expect(opts.titleBarOverlay).toEqual({
        color: '#1a1a1f',
        symbolColor: '#f0f0f0',
        height: 40
      })
      expect(opts.backgroundColor).toBe('#1a1a1f')
    })
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

  it('loads speech_to_text@2x tray icon and marks it as template when present', () => {
    const manager = new WindowManager()
    manager.ensureTray()

    expect(mocks.nativeImage.createFromPath).toHaveBeenCalledWith(TRAY_ICON_PATHS.speechToText2x)
    expect(mocks.trayIconImage.isEmpty).toHaveBeenCalledTimes(1)
    expect(mocks.trayIconImage.setTemplateImage).toHaveBeenCalledWith(true)
  })

  it('falls back to an empty image when tray icon cannot be loaded', () => {
    const manager = new WindowManager()
    mocks.nativeImage.createFromPath.mockReturnValueOnce({
      isEmpty: vi.fn(() => true),
      setTemplateImage: vi.fn()
    })

    manager.ensureTray()

    expect(mocks.nativeImage.createEmpty).toHaveBeenCalledTimes(1)
    expect(mocks.Tray).toHaveBeenCalledWith(mocks.emptyImage)
  })

  it('builds tray context menu with Settings and Quit actions', () => {
    const manager = new WindowManager()
    manager.ensureTray()

    expect(mocks.Menu.buildFromTemplate).toHaveBeenCalledTimes(1)
    const template = mocks.Menu.buildFromTemplate.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    expect(template[0]?.label).toBe('Settings')
    expect(template[1]?.type).toBe('separator')
    expect(template[2]?.label).toBe('Quit')
  })

  it('opens settings route immediately when renderer is already loaded', () => {
    const manager = new WindowManager()
    manager.ensureTray()

    const template = mocks.Menu.buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string; click?: () => void }>
    const settingsItem = template.find((item) => item.label === 'Settings')

    settingsItem?.click?.()

    expect(mocks.show).toHaveBeenCalledTimes(1)
    expect(mocks.focus).toHaveBeenCalledTimes(1)
    expect(mocks.webContentsSend).toHaveBeenCalledWith(IPC_CHANNELS.onOpenSettings)
    expect(mocks.webContentsOnce).not.toHaveBeenCalled()
  })

  it('waits for renderer load before opening settings when window is still loading', () => {
    const manager = new WindowManager()
    manager.ensureTray()
    mocks.webContentsIsLoadingMainFrame.mockReturnValue(true)

    const template = mocks.Menu.buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string; click?: () => void }>
    const settingsItem = template.find((item) => item.label === 'Settings')

    settingsItem?.click?.()

    expect(mocks.webContentsSend).not.toHaveBeenCalled()
    expect(mocks.webContentsOnce).toHaveBeenCalledTimes(1)

    const onDidFinishLoad = mocks.trayListeners.get('webcontents:did-finish-load')
    expect(onDidFinishLoad).toBeTypeOf('function')
    onDidFinishLoad?.()

    expect(mocks.webContentsSend).toHaveBeenCalledWith(IPC_CHANNELS.onOpenSettings)
  })
})
