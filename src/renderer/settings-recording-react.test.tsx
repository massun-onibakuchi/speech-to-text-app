/*
Where: src/renderer/settings-recording-react.test.tsx
What: Component tests for React-rendered Settings recording section.
Why: Guard selector/behavior parity while migrating recording controls to React ownership.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
     Issue #299: updated for Radix Select migration — interactions use shim native selects,
     style assertions check data-slot/data-testid instead of CSS class names.
*/

// @vitest-environment jsdom

// Mock the Radix Select primitive with a minimal shim for testability.
// Radix Select's portal+pointer interaction does not run in jsdom; this shim
// replaces the primitive with native elements so tests focus on component logic.
vi.mock('./components/ui/select', () => {
  const React = require('react')

  // Select root: renders a native <select> wired to onValueChange.
  const Select = ({ value, onValueChange, children }: {
    value?: string
    onValueChange?: (val: string) => void
    children?: React.ReactNode
  }) => React.createElement('select', {
    'data-select-root': 'true',
    value,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value)
  }, children)

  // Trigger shim: keeps id/testid/className for assertions; renders as button.
  const SelectTrigger = React.forwardRef(
    ({ id, 'data-testid': testId, className, children, ...rest }: any, ref: any) =>
      React.createElement('button', {
        ref, id, 'data-testid': testId, 'data-slot': 'select-trigger', className, ...rest
      }, children)
  )
  SelectTrigger.displayName = 'SelectTrigger'

  // Content: pass-through so SelectItem children reach the native <select>.
  const SelectContent = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  SelectContent.displayName = 'SelectContent'

  // Value: renders nothing in shim (native select shows the selected option text).
  const SelectValue = () => null
  SelectValue.displayName = 'SelectValue'

  // Item: renders as <option> so native select can pick it.
  const SelectItem = ({ value, children, className }: { value: string; children?: React.ReactNode; className?: string }) =>
    React.createElement('option', { value, className }, children)
  SelectItem.displayName = 'SelectItem'

  const SelectGroup = ({ children }: any) => React.createElement(React.Fragment, null, children)
  const SelectLabel = ({ children }: any) => React.createElement('span', null, children)
  const SelectSeparator = () => null

  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem, SelectGroup, SelectLabel, SelectSeparator }
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST } from '../shared/domain'
import { SettingsRecordingReact } from './settings-recording-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

// Simulate selecting a value in the shim native <select> wired to Radix onValueChange.
const changeShimSelect = (selectEl: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(selectEl, value)
  selectEl.dispatchEvent(new Event('change', { bubbles: true }))
}

// Find the shim <select data-select-root> that owns a given SelectTrigger testid.
const shimForTestId = (host: HTMLElement, testId: string): HTMLSelectElement => {
  const trigger = host.querySelector(`[data-testid="${testId}"]`)
  const shim = trigger?.closest<HTMLSelectElement>('[data-select-root]')
  if (!shim) throw new Error(`No shim select found for testId="${testId}"`)
  return shim
}

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
        <SettingsRecordingReact
          settings={DEFAULT_SETTINGS}
          audioInputSources={[
            { id: 'system_default', label: 'System Default Microphone' },
            { id: 'usb-mic', label: 'USB Mic' }
          ]}
          audioSourceHint="Detected 1 selectable microphone source(s)."
          onRefreshAudioSources={onRefreshAudioSources}
          onSelectRecordingMethod={onSelectRecordingMethod}
          onSelectRecordingSampleRate={onSelectRecordingSampleRate}
          onSelectRecordingDevice={onSelectRecordingDevice}
          onSelectTranscriptionProvider={onSelectTranscriptionProvider}
          onSelectTranscriptionModel={onSelectTranscriptionModel}
        />
      )
    })

    // Trigger buttons carry the id; shim selects carry data-select-root.
    expect(host.querySelector('#settings-recording-device')).not.toBeNull()
    expect(host.querySelector<HTMLElement>('#settings-audio-sources-message')?.textContent).toContain('Detected 1 selectable')
    expect(host.querySelector<HTMLElement>('#settings-help-stt-language')?.textContent).toContain('auto-detect')
    expect(host.querySelector<HTMLElement>('#settings-help-stt-language')?.textContent).toContain('outputLanguage')
    expect(host.textContent).not.toContain('Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.')

    const methodShim = shimForTestId(host, 'select-recording-method')
    await act(async () => { changeShimSelect(methodShim, 'cpal') })
    expect(onSelectRecordingMethod).toHaveBeenCalledWith('cpal')

    const sampleRateShim = shimForTestId(host, 'select-recording-sample-rate')
    await act(async () => { changeShimSelect(sampleRateShim, '48000') })
    expect(onSelectRecordingSampleRate).toHaveBeenCalledWith(48000)

    const deviceShim = shimForTestId(host, 'select-recording-device')
    await act(async () => { changeShimSelect(deviceShim, 'usb-mic') })
    expect(onSelectRecordingDevice).toHaveBeenCalledWith('usb-mic')

    const providerShim = shimForTestId(host, 'select-recording-transcription-provider')
    await act(async () => { changeShimSelect(providerShim, 'elevenlabs') })

    expect(onSelectTranscriptionProvider).toHaveBeenCalledTimes(1)
    expect(onSelectTranscriptionProvider).toHaveBeenCalledWith('elevenlabs')

    // After provider change, model shim value auto-resets to first elevenlabs model.
    const modelShim = shimForTestId(host, 'select-recording-transcription-model')
    expect(modelShim.value).toBe(STT_MODEL_ALLOWLIST.elevenlabs[0])

    await act(async () => { changeShimSelect(modelShim, STT_MODEL_ALLOWLIST.elevenlabs[0]) })
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

  it('can render speech-to-text and audio-input controls as separate sections', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <>
          <SettingsRecordingReact
            section="speech-to-text"
            settings={DEFAULT_SETTINGS}
            audioInputSources={[{ id: 'system_default', label: 'System Default Microphone' }]}
            audioSourceHint="Detected 0 selectable microphone source(s)."
            onRefreshAudioSources={vi.fn().mockResolvedValue(undefined)}
            onSelectRecordingMethod={vi.fn()}
            onSelectRecordingSampleRate={vi.fn()}
            onSelectRecordingDevice={vi.fn()}
            onSelectTranscriptionProvider={vi.fn()}
            onSelectTranscriptionModel={vi.fn()}
          />
          <SettingsRecordingReact
            section="audio-input"
            settings={DEFAULT_SETTINGS}
            audioInputSources={[{ id: 'system_default', label: 'System Default Microphone' }]}
            audioSourceHint="Detected 0 selectable microphone source(s)."
            onRefreshAudioSources={vi.fn().mockResolvedValue(undefined)}
            onSelectRecordingMethod={vi.fn()}
            onSelectRecordingSampleRate={vi.fn()}
            onSelectRecordingDevice={vi.fn()}
            onSelectTranscriptionProvider={vi.fn()}
            onSelectTranscriptionModel={vi.fn()}
          />
        </>
      )
    })

    // Each section renders its own unique controls — id attributes are on trigger buttons.
    expect(host.querySelectorAll('#settings-transcription-provider')).toHaveLength(1)
    expect(host.querySelectorAll('#settings-recording-device')).toHaveLength(1)
    expect(host.querySelectorAll('#settings-help-stt-language')).toHaveLength(1)
    expect(host.querySelectorAll('#settings-audio-sources-message')).toHaveLength(1)
    expect(host.textContent).not.toContain('Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.')
  })

  // Issue #255/#299: regression guard — all selects must use Radix Select triggers (not native <select>).
  it('renders all selects as Radix Select triggers with correct ids and testids', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsRecordingReact
          settings={DEFAULT_SETTINGS}
          audioInputSources={[{ id: 'system_default', label: 'System Default Microphone' }]}
          audioSourceHint="hint"
          onRefreshAudioSources={vi.fn().mockResolvedValue(undefined)}
          onSelectRecordingMethod={vi.fn()}
          onSelectRecordingSampleRate={vi.fn()}
          onSelectRecordingDevice={vi.fn()}
          onSelectTranscriptionProvider={vi.fn()}
          onSelectTranscriptionModel={vi.fn()}
        />
      )
    })

    // All five select triggers must have data-slot="select-trigger" (set by Radix shim).
    const expectedTriggers = [
      { testId: 'select-recording-transcription-provider', id: 'settings-transcription-provider' },
      { testId: 'select-recording-transcription-model',    id: 'settings-transcription-model' },
      { testId: 'select-recording-method',                 id: 'settings-recording-method' },
      { testId: 'select-recording-sample-rate',            id: 'settings-recording-sample-rate' },
      { testId: 'select-recording-device',                 id: 'settings-recording-device' }
    ]

    for (const { testId, id } of expectedTriggers) {
      const trigger = host.querySelector(`[data-testid="${testId}"]`)!
      expect(trigger, `${testId} should exist`).not.toBeNull()
      expect(trigger.getAttribute('data-slot'), `${testId} should be Radix trigger`).toBe('select-trigger')
      expect(trigger.getAttribute('id'), `${testId} should have correct id`).toBe(id)
    }

    // Label spans with muted-foreground are present for each select control.
    const mutedSpans = host.querySelectorAll<HTMLSpanElement>('span.text-muted-foreground')
    expect(mutedSpans.length).toBeGreaterThanOrEqual(5)
  })
})
