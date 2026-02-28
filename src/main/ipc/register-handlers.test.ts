import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const quit = vi.fn()
  const showErrorBox = vi.fn()
  return {
    quit,
    showErrorBox,
    ipcHandle: vi.fn(),
    ipcOn: vi.fn(),
    getAllWindows: vi.fn(() => []),
    settingsCtor: vi.fn(() => {
      throw new Error('invalid settings payload')
    })
  }
})

vi.mock('electron', () => ({
  app: { quit: mocks.quit },
  dialog: { showErrorBox: mocks.showErrorBox },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows
  },
  ipcMain: {
    handle: mocks.ipcHandle,
    on: mocks.ipcOn
  },
  globalShortcut: {}
}))

vi.mock('../services/settings-service', () => ({
  SettingsService: mocks.settingsCtor
}))

import { registerIpcHandlers } from './register-handlers'

describe('registerIpcHandlers', () => {
  it('shows recovery error and quits app when settings initialization fails', () => {
    expect(() => registerIpcHandlers()).toThrow('invalid settings payload')

    expect(mocks.showErrorBox).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })
})
