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

describe('ScratchSpaceWindowService', () => {
  it('uses a macOS panel window and explicitly focuses it for immediate typing', async () => {
    const browserWindow = {
      isVisible: () => false,
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        }
      })

      await service.show()
      service.markRendererReady()
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
    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(1)
    expect(browserWindow.webContents.send).toHaveBeenCalledWith('scratch-space:open', { reason: 'fresh' })
  })

  it('preserves focus-on-open behavior outside macOS', async () => {
    const browserWindow = {
      isVisible: () => false,
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('linux', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        }
      })

      await service.show()
      service.markRendererReady()
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
  })

  it('reopens an already-visible macOS scratch window and keeps it focused for typing', async () => {
    const isVisible = vi.fn(() => false)
    const browserWindow = {
      isVisible,
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const captureFrontmostBundleId = vi.fn(async () => 'com.apple.Safari')
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId
        }
      })

      await service.show()
      service.markRendererReady()
      isVisible.mockReturnValue(true)
      await service.show()
    })

    expect(browserWindow.show).toHaveBeenCalledTimes(2)
    expect(browserWindow.focus).toHaveBeenCalledTimes(2)
    expect(captureFrontmostBundleId).toHaveBeenCalledTimes(1)
  })

  it('sends retry context when scratch space is reopened after a failed execution', async () => {
    const browserWindow = {
      isVisible: () => false,
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => 'com.apple.Safari')
        }
      })

      await service.show({ reason: 'retry', captureTarget: false })
      service.markRendererReady()
    })

    expect(browserWindow.webContents.send).toHaveBeenCalledWith('scratch-space:open', { reason: 'retry' })
  })

  it('opens the scratch-local preset menu when the scratch window is visible', async () => {
    const browserWindow = {
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        }
      })

      await service.show()
      service.markRendererReady()
      expect(service.openPresetMenuIfVisible()).toBe(true)
    })

    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(2)
    expect(browserWindow.webContents.send).toHaveBeenCalledWith('scratch-space:open-preset-menu')
  })

  it('waits for the scratch renderer-ready signal before opening the preset menu', async () => {
    const browserWindow = {
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: vi.fn(() => true),
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        }
      })

      await service.show()
      expect(service.openPresetMenuIfVisible()).toBe(true)
      expect(browserWindow.webContents.send).not.toHaveBeenCalledWith('scratch-space:open-preset-menu')
      browserWindow.webContents.isLoadingMainFrame.mockReturnValue(false)
      service.markRendererReady()
    })

    expect(browserWindow.webContents.send).toHaveBeenCalledWith('scratch-space:open-preset-menu')
  })

  it('does not open the scratch-local preset menu when the scratch window is hidden', async () => {
    const browserWindow = {
      isVisible: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      on: vi.fn(),
      loadFile: vi.fn(async () => undefined),
      loadURL: vi.fn(async () => undefined),
      webContents: {
        on: vi.fn(),
        isLoadingMainFrame: () => false,
        send: vi.fn()
      }
    }
    const create = vi.fn(() => browserWindow as never)

    await withPlatform('darwin', async () => {
      const service = new ScratchSpaceWindowService({
        create,
        focusClient: {
          captureFrontmostBundleId: vi.fn(async () => null)
        }
      })

      expect(service.openPresetMenuIfVisible()).toBe(false)
    })

    expect(browserWindow.webContents.send).not.toHaveBeenCalledWith('scratch-space:open-preset-menu')
  })
})
