import { describe, expect, it, vi } from 'vitest'
import type { RecordingCommandDispatch } from '../../shared/ipc'
import { dispatchRecordingCommandToRenderers, type RendererWindowLike } from './recording-command-dispatcher'

const DISPATCH: RecordingCommandDispatch = { command: 'toggleRecording', preferredDeviceId: 'mic-1' }

const makeWindow = (overrides?: Partial<RendererWindowLike>): RendererWindowLike => ({
  id: 1,
  isDestroyed: () => false,
  webContents: {
    isDestroyed: () => false,
    isCrashed: () => false,
    send: vi.fn()
  },
  ...overrides
})

describe('dispatchRecordingCommandToRenderers', () => {
  it('dispatches to active windows and returns delivery count', () => {
    const first = makeWindow({ id: 1 })
    const second = makeWindow({ id: 2 })

    const delivered = dispatchRecordingCommandToRenderers([first, second], DISPATCH)

    expect(delivered).toBe(2)
    expect(first.webContents.send).toHaveBeenCalledTimes(1)
    expect(second.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('skips destroyed and crashed windows', () => {
    const active = makeWindow({ id: 1 })
    const destroyed = makeWindow({ id: 2, isDestroyed: () => true })
    const crashed = makeWindow({
      id: 3,
      webContents: {
        isDestroyed: () => false,
        isCrashed: () => true,
        send: vi.fn()
      }
    })

    const delivered = dispatchRecordingCommandToRenderers([active, destroyed, crashed], DISPATCH)

    expect(delivered).toBe(1)
    expect(active.webContents.send).toHaveBeenCalledTimes(1)
    expect(crashed.webContents.send).not.toHaveBeenCalled()
  })

  it('continues when send throws for one window', () => {
    const broken = makeWindow({
      id: 1,
      webContents: {
        isDestroyed: () => false,
        isCrashed: () => false,
        send: vi.fn(() => {
          throw new Error('send failed')
        })
      }
    })
    const healthy = makeWindow({ id: 2 })

    const delivered = dispatchRecordingCommandToRenderers([broken, healthy], DISPATCH)

    expect(delivered).toBe(1)
    expect(healthy.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('dispatches only to the targeted renderer window when a target id is provided', () => {
    const first = makeWindow({ id: 1 })
    const second = makeWindow({ id: 2 })

    const delivered = dispatchRecordingCommandToRenderers([first, second], DISPATCH, 2)

    expect(delivered).toBe(1)
    expect(first.webContents.send).not.toHaveBeenCalled()
    expect(second.webContents.send).toHaveBeenCalledTimes(1)
  })
})
