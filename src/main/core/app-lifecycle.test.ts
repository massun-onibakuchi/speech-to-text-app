/**
 * Where: src/main/core/app-lifecycle.test.ts
 * What:  Tests for AppLifecycle activation, window-close, and quit-cleanup behavior.
 * Why:   Prevent regressions where closing the main window exits the process and kills global shortcuts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type AppListener = (...args: unknown[]) => void

const mocks = vi.hoisted(() => {
  const appListeners = new Map<string, AppListener>()
  const requestSingleInstanceLock = vi.fn<() => boolean>()
  const quit = vi.fn()
  const on = vi.fn((event: string, listener: AppListener) => {
    appListeners.set(event, listener)
  })
  const whenReady = vi.fn<() => Promise<void>>()
  const setLoginItemSettings = vi.fn()
  const registerIpcHandlers = vi.fn()
  const unregisterGlobalHotkeys = vi.fn()

  const createMainWindow = vi.fn()
  const ensureTray = vi.fn()
  const showMainWindow = vi.fn()
  const markQuitting = vi.fn()

  return {
    appListeners,
    requestSingleInstanceLock,
    quit,
    on,
    whenReady,
    setLoginItemSettings,
    registerIpcHandlers,
    unregisterGlobalHotkeys,
    createMainWindow,
    ensureTray,
    showMainWindow,
    markQuitting
  }
})

vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: mocks.requestSingleInstanceLock,
    quit: mocks.quit,
    on: mocks.on,
    whenReady: mocks.whenReady,
    setLoginItemSettings: mocks.setLoginItemSettings
  },
  BrowserWindow: {}
}))

vi.mock('../ipc/register-handlers', () => ({
  registerIpcHandlers: mocks.registerIpcHandlers,
  unregisterGlobalHotkeys: mocks.unregisterGlobalHotkeys
}))

vi.mock('./window-manager', () => ({
  WindowManager: vi.fn().mockImplementation(() => ({
    createMainWindow: mocks.createMainWindow,
    ensureTray: mocks.ensureTray,
    showMainWindow: mocks.showMainWindow,
    markQuitting: mocks.markQuitting
  }))
}))

import { AppLifecycle } from './app-lifecycle'

describe('AppLifecycle', () => {
  beforeEach(() => {
    mocks.appListeners.clear()
    vi.clearAllMocks()
    mocks.requestSingleInstanceLock.mockReturnValue(true)
    mocks.whenReady.mockResolvedValue(undefined)
  })

  it('preserves platform window-all-closed behavior', async () => {
    const lifecycle = new AppLifecycle()

    lifecycle.initialize()
    await Promise.resolve()

    expect(mocks.registerIpcHandlers).toHaveBeenCalledOnce()
    expect(mocks.createMainWindow).toHaveBeenCalledOnce()
    expect(mocks.ensureTray).toHaveBeenCalledOnce()

    const onWindowAllClosed = mocks.appListeners.get('window-all-closed')
    expect(onWindowAllClosed).toBeTypeOf('function')

    onWindowAllClosed?.()

    if (process.platform === 'darwin') {
      expect(mocks.quit).not.toHaveBeenCalled()
    } else {
      expect(mocks.quit).toHaveBeenCalledOnce()
    }
  })

  it('restores or shows the main window when the app is activated', async () => {
    const lifecycle = new AppLifecycle()

    lifecycle.initialize()
    await Promise.resolve()

    const onActivate = mocks.appListeners.get('activate')
    expect(onActivate).toBeTypeOf('function')

    onActivate?.()

    expect(mocks.showMainWindow).toHaveBeenCalledOnce()
  })

  it('marks the window manager as quitting before app quit closes windows', () => {
    const lifecycle = new AppLifecycle()

    lifecycle.initialize()

    const onBeforeQuit = mocks.appListeners.get('before-quit')
    expect(onBeforeQuit).toBeTypeOf('function')

    onBeforeQuit?.()

    expect(mocks.markQuitting).toHaveBeenCalledOnce()
  })

  it('unregisters global hotkeys on will-quit', () => {
    const lifecycle = new AppLifecycle()

    lifecycle.initialize()

    const onWillQuit = mocks.appListeners.get('will-quit')
    expect(onWillQuit).toBeTypeOf('function')

    onWillQuit?.()

    expect(mocks.unregisterGlobalHotkeys).toHaveBeenCalledOnce()
  })
})
