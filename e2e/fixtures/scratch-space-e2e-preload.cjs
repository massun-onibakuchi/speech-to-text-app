/**
 * Where: e2e/fixtures/scratch-space-e2e-preload.cjs
 * What:  Minimal preload used only by the scratch-space Playwright E2E popup.
 * Why:   The production preload exposes non-redefinable APIs, so the test needs a controlled
 *        mock wrapper that preserves the renderer contract while recording transform calls.
 */

const { contextBridge, ipcRenderer } = require('electron')

const IPC_CHANNELS = {
  getSettings: 'settings:get',
  getScratchSpaceDraft: 'scratch-space:get-draft',
  setScratchSpaceDraft: 'scratch-space:set-draft',
  hideScratchSpaceWindow: 'scratch-space:hide-window',
  onSettingsUpdated: 'settings:on-updated',
  onOpenScratchSpace: 'scratch-space:open'
}

const transformCalls = []

contextBridge.exposeInMainWorld('speechToTextApi', {
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  getScratchSpaceDraft: async () => ipcRenderer.invoke(IPC_CHANNELS.getScratchSpaceDraft),
  setScratchSpaceDraft: async (draft) => ipcRenderer.invoke(IPC_CHANNELS.setScratchSpaceDraft, draft),
  runScratchSpaceTransformation: async (payload) => {
    transformCalls.push({ ...payload })
    return {
      status: 'ok',
      message: 'mocked scratch-space execution',
      text: payload.text.toUpperCase()
    }
  },
  hideScratchSpaceWindow: async () => ipcRenderer.invoke(IPC_CHANNELS.hideScratchSpaceWindow),
  onSettingsUpdated: (listener) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.onSettingsUpdated, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onSettingsUpdated, handler)
    }
  },
  onOpenScratchSpace: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on(IPC_CHANNELS.onOpenScratchSpace, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onOpenScratchSpace, handler)
    }
  }
})

contextBridge.exposeInMainWorld('electronPlatform', 'darwin')
contextBridge.exposeInMainWorld('__scratchSpaceE2e', {
  getTransformCalls: () => transformCalls.map((call) => ({ ...call }))
})
