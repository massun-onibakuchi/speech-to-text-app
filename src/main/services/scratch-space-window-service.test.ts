/**
 * Where: src/main/services/scratch-space-window-service.test.ts
 * What:  Focused unit tests for the scratch-space popup BrowserWindow configuration.
 * Why:   Keep window chrome colors aligned with the renderer canvas so title-bar tweaks do not drift.
 */

import { describe, expect, it, vi } from 'vitest'
import { ScratchSpaceWindowService } from './scratch-space-window-service'

const withPlatform = async (platform: NodeJS.Platform, run: () => Promise<void>) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform
  })

  try {
    await run()
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process, 'platform', originalDescriptor)
    }
  }
}

const buildGlobalShortcut = () => {
  let registeredCallback: (() => void) | undefined

  return {
    isRegistered: vi.fn(() => false),
    register: vi.fn((_accelerator: string, callback: () => void) => {
      registeredCallback = callback
      return true
    }),
    unregister: vi.fn(),
    getRegisteredCallback: () => registeredCallback
  }
}

describe('ScratchSpaceWindowService', () => {
  it('uses a macOS panel window and avoids explicit focus when opening scratch space', async () => {
    const browserWindow = {
      isVisible: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      showInactive: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)
    const globalShortcut = buildGlobalShortcut()

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        },
        globalShortcut
      })

      await service.show()
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'panel',
        backgroundColor: '#060709'
      })
    )
    const firstWindowOptions = create.mock.calls.at(0)?.at(0)
    expect(firstWindowOptions).toBeDefined()
    expect(firstWindowOptions).not.toHaveProperty('titleBarOverlay')
    expect(browserWindow.showInactive).toHaveBeenCalledTimes(1)
    expect(browserWindow.show).not.toHaveBeenCalled()
    expect(browserWindow.focus).not.toHaveBeenCalled()
    expect(globalShortcut.register).toHaveBeenCalledWith('Escape', expect.any(Function))
  })

  it('preserves the existing focus-on-open behavior outside macOS', async () => {
    const browserWindow = {
      isVisible: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)
    const globalShortcut = buildGlobalShortcut()

    await withPlatform('linux', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        },
        globalShortcut
      })

      await service.show()
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#060709',
        titleBarOverlay: expect.objectContaining({
          color: '#060709'
        })
      })
    )
    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(1)
    expect(globalShortcut.register).not.toHaveBeenCalled()
  })

  it('reopens an already-visible macOS scratch window without switching to show()', async () => {
    const isVisible = vi.fn(() => false)
    const browserWindow = {
      isVisible,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      showInactive: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const captureFrontmostBundleId = vi.fn(async () => 'com.apple.Safari')
    const create = vi.fn(() => browserWindow as never)
    const globalShortcut = buildGlobalShortcut()

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId
        },
        globalShortcut
      })

      await service.show()
      isVisible.mockReturnValue(true)
      await service.show()
    })

    expect(browserWindow.showInactive).toHaveBeenCalledTimes(2)
    expect(browserWindow.show).not.toHaveBeenCalled()
    expect(browserWindow.focus).not.toHaveBeenCalled()
    expect(captureFrontmostBundleId).toHaveBeenCalledTimes(1)
    expect(globalShortcut.register).toHaveBeenCalledTimes(1)
  })

  it('unregisters the temporary Escape shortcut when the scratch window hides', async () => {
    const browserWindow = {
      isVisible: vi.fn(() => true),
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      showInactive: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)
    const globalShortcut = buildGlobalShortcut()

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        },
        globalShortcut
      })

      await service.show()
      service.hide()
    })

    expect(browserWindow.hide).toHaveBeenCalledTimes(1)
    expect(globalShortcut.unregister).toHaveBeenCalledWith('Escape')
  })

  it('hides scratch space when the temporary Escape shortcut fires on macOS', async () => {
    const browserWindow = {
      isVisible: vi.fn(() => true),
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      showInactive: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)
    const globalShortcut = buildGlobalShortcut()

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        },
        globalShortcut
      })

      await service.show()

      const callback = globalShortcut.getRegisteredCallback()
      expect(callback).toBeTypeOf('function')
      callback?.()
    })

    expect(browserWindow.hide).toHaveBeenCalledTimes(1)
    expect(globalShortcut.unregister).toHaveBeenCalledWith('Escape')
  })
})
