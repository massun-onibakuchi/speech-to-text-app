import { describe, expect, it, vi } from 'vitest'
import type { RecordingCommandDispatch } from '../../shared/ipc'
import { dispatchRecordingCommandToRenderers, type RendererWindowLike } from './recording-command-dispatcher'

const DISPATCH: RecordingCommandDispatch = { command: 'startRecording', preferredDeviceId: 'mic-1' }

const makeWindow = (overrides?: Partial<RendererWindowLike>): RendererWindowLike => ({
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
    const first = makeWindow()
    const second = makeWindow()

    const delivered = dispatchRecordingCommandToRenderers([first, second], DISPATCH)

    expect(delivered).toBe(2)
    expect(first.webContents.send).toHaveBeenCalledTimes(1)
    expect(second.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('skips destroyed and crashed windows', () => {
    const active = makeWindow()
    const destroyed = makeWindow({ isDestroyed: () => true })
    const crashed = makeWindow({
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
      webContents: {
        isDestroyed: () => false,
        isCrashed: () => false,
        send: vi.fn(() => {
          throw new Error('send failed')
        })
      }
    })
    const healthy = makeWindow()

    const delivered = dispatchRecordingCommandToRenderers([broken, healthy], DISPATCH)

    expect(delivered).toBe(1)
    expect(healthy.webContents.send).toHaveBeenCalledTimes(1)
  })
})
