import { IPC_CHANNELS, type RecordingCommandDispatch } from '../../shared/ipc'

export interface RendererWindowLike {
  isDestroyed: () => boolean
  webContents: {
    isDestroyed: () => boolean
    isCrashed?: () => boolean
    send: (channel: string, payload: RecordingCommandDispatch) => void
  }
}

export const dispatchRecordingCommandToRenderers = (
  windows: RendererWindowLike[],
  dispatch: RecordingCommandDispatch
): number => {
  let delivered = 0

  for (const window of windows) {
    if (window.isDestroyed()) {
      continue
    }

    const { webContents } = window
    if (webContents.isDestroyed()) {
      continue
    }
    if (typeof webContents.isCrashed === 'function' && webContents.isCrashed()) {
      continue
    }

    try {
      webContents.send(IPC_CHANNELS.onRecordingCommand, dispatch)
      delivered += 1
    } catch {
      // Continue dispatching to other windows.
    }
  }

  return delivered
}
