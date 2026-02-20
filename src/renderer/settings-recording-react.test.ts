/*
Where: src/renderer/settings-recording-react.test.ts
What: Component tests for React-rendered Settings recording section.
Why: Guard selector/behavior parity while migrating recording controls to React ownership.
*/

// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST } from '../shared/domain'
import { SettingsRecordingReact } from './settings-recording-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsRecordingReact', () => {
  it('updates provider/model and refreshes audio sources through callbacks', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    let resolveRefresh: (() => void) | null = null
    const onRefreshAudioSources = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        })
    )
    const onSelectRecordingMethod = vi.fn()
    const onSelectRecordingSampleRate = vi.fn()
    const onSelectRecordingDevice = vi.fn()
    const onSelectTranscriptionProvider = vi.fn()
    const onSelectTranscriptionModel = vi.fn()

    await act(async () => {
      root?.render(
        createElement(SettingsRecordingReact, {
          settings: DEFAULT_SETTINGS,
          audioInputSources: [
            { id: 'system_default', label: 'System Default Microphone' },
            { id: 'usb-mic', label: 'USB Mic' }
          ],
          audioSourceHint: 'Detected 1 selectable microphone source(s).',
          onRefreshAudioSources,
          onSelectRecordingMethod,
          onSelectRecordingSampleRate,
          onSelectRecordingDevice,
          onSelectTranscriptionProvider,
          onSelectTranscriptionModel
        })
      )
    })

    expect(host.querySelector<HTMLSelectElement>('#settings-recording-device')).not.toBeNull()
    expect(host.querySelector<HTMLElement>('#settings-audio-sources-message')?.textContent).toContain('Detected 1 selectable')

    const method = host.querySelector<HTMLSelectElement>('#settings-recording-method')
    await act(async () => {
      method!.value = 'cpal'
      method?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectRecordingMethod).toHaveBeenCalledWith('cpal')

    const sampleRate = host.querySelector<HTMLSelectElement>('#settings-recording-sample-rate')
    await act(async () => {
      sampleRate!.value = '48000'
      sampleRate?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectRecordingSampleRate).toHaveBeenCalledWith(48000)

    const device = host.querySelector<HTMLSelectElement>('#settings-recording-device')
    await act(async () => {
      device!.value = 'usb-mic'
      device?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectRecordingDevice).toHaveBeenCalledWith('usb-mic')

    const provider = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')
    await act(async () => {
      provider!.value = 'elevenlabs'
      provider?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onSelectTranscriptionProvider).toHaveBeenCalledTimes(1)
    expect(onSelectTranscriptionProvider).toHaveBeenCalledWith('elevenlabs')
    expect(host.querySelector<HTMLSelectElement>('#settings-transcription-model')?.value).toBe(STT_MODEL_ALLOWLIST.elevenlabs[0])

    const model = host.querySelector<HTMLSelectElement>('#settings-transcription-model')
    await act(async () => {
      model!.value = 'scribe_v2'
      model?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectTranscriptionModel).toHaveBeenCalledTimes(1)
    expect(onSelectTranscriptionModel).toHaveBeenCalledWith(STT_MODEL_ALLOWLIST.elevenlabs[0])

    const refreshButton = host.querySelector<HTMLButtonElement>('#settings-refresh-audio-sources')
    await act(async () => {
      refreshButton?.click()
    })
    expect(onRefreshAudioSources).toHaveBeenCalledTimes(1)
    expect(refreshButton?.disabled).toBe(true)

    await act(async () => {
      resolveRefresh?.()
    })
    expect(refreshButton?.disabled).toBe(false)
  })
})
