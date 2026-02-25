// src/main/services/sound-service-afplay.test.ts
// What: Verifies the default afplay backend swallows spawn errors.
// Why:  Prevents unhandled child_process 'error' events from crashing the app.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SoundEvent } from '../../shared/ipc'

type ErrorHandler = (error: Error) => void

let errorHandler: ErrorHandler | undefined

const childProcessStub = {
  on: vi.fn((event: string, handler: ErrorHandler) => {
    if (event === 'error') {
      errorHandler = handler
    }
  }),
  unref: vi.fn()
}

const spawnMock = vi.fn(() => childProcessStub)

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}))

const STUB_PATHS: Record<SoundEvent, string> = {
  recording_started: '/stub/sounds/recording_started.mp3',
  recording_stopped: '/stub/sounds/recording_stopped.mp3',
  recording_cancelled: '/stub/sounds/recording_cancelled.mp3',
  transformation_succeeded: '/stub/sounds/transformation_succeeded.mp3',
  transformation_failed: '/stub/sounds/transformation_failed.mp3'
}

describe('afplay backend', () => {
  beforeEach(() => {
    errorHandler = undefined
    spawnMock.mockClear()
    childProcessStub.on.mockClear()
    childProcessStub.unref.mockClear()
    vi.resetModules()
  })

  it('swallows spawn error events without throwing', async () => {
    const { ElectronSoundService } = await import('./sound-service')
    const service = new ElectronSoundService(STUB_PATHS)

    expect(() => service.play('recording_started')).not.toThrow()
    expect(spawnMock).toHaveBeenCalledOnce()
    expect(childProcessStub.unref).toHaveBeenCalledOnce()
    expect(errorHandler).toBeDefined()

    expect(() => errorHandler?.(new Error('spawn failed'))).not.toThrow()
  })
})
