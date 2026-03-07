/**
 * Where: src/main/services/app-updater-service.test.ts
 * What:  Tests the prompt-before-download release update flow.
 * Why:   Prevent silent download regressions and keep restart/install prompting explicit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppUpdaterService } from './app-updater-service'

type UpdaterListener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, UpdaterListener>()
  const on = vi.fn((event: string, listener: UpdaterListener) => {
    listeners.set(event, listener)
  })

  return {
    listeners,
    isPackaged: true,
    showMessageBox: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on
  }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    }
  },
  dialog: {
    showMessageBox: mocks.showMessageBox
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: mocks.on,
    checkForUpdates: mocks.checkForUpdates,
    downloadUpdate: mocks.downloadUpdate,
    quitAndInstall: mocks.quitAndInstall
  }
}))

describe('AppUpdaterService', () => {
  beforeEach(() => {
    mocks.listeners.clear()
    mocks.isPackaged = true
    vi.clearAllMocks()
    mocks.checkForUpdates.mockResolvedValue(undefined)
    mocks.downloadUpdate.mockResolvedValue(undefined)
    mocks.showMessageBox.mockResolvedValue({ response: 1 })
  })

  it('checks for updates only when the app is packaged', async () => {
    mocks.isPackaged = false
    const service = new AppUpdaterService()

    service.start()
    await Promise.resolve()

    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
  })

  it('disables auto-download before checking for updates', async () => {
    const service = new AppUpdaterService()

    service.start()
    await Promise.resolve()

    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('downloads an available update when the user accepts the prompt', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })
    const service = new AppUpdaterService()

    service.start()
    const listener = mocks.listeners.get('update-available')
    expect(listener).toBeTypeOf('function')

    await listener?.({ version: '0.2.0' })

    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update Available',
        message: 'Version 0.2.0 is available.'
      })
    )
    expect(mocks.downloadUpdate).toHaveBeenCalledOnce()
  })

  it('does not download an available update when the user defers', async () => {
    const service = new AppUpdaterService()

    service.start()
    const listener = mocks.listeners.get('update-available')
    await listener?.({ version: '0.2.0' })

    expect(mocks.downloadUpdate).not.toHaveBeenCalled()
  })

  it('prompts to restart when an update download completes', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })
    const service = new AppUpdaterService()

    service.start()
    const listener = mocks.listeners.get('update-downloaded')
    expect(listener).toBeTypeOf('function')

    await listener?.({ version: '0.2.0' })

    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Install Update',
        message: 'Version 0.2.0 has been downloaded.'
      })
    )
    expect(mocks.quitAndInstall).toHaveBeenCalledOnce()
  })
})
