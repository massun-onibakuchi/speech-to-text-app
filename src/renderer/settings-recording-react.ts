/*
Where: src/renderer/settings-recording-react.ts
What: React-rendered Settings recording controls section.
Why: Continue Settings migration to React while preserving selectors and behavior parity.
*/

import { createElement } from 'react'
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import type { AudioInputSource } from '../shared/ipc'

interface SettingsRecordingReactProps {
  settings: Settings
  audioInputSources: AudioInputSource[]
  audioSourceHint: string
  onRefreshAudioSources: () => Promise<void>
  onSelectRecordingMethod: (method: Settings['recording']['method']) => void
  onSelectRecordingSampleRate: (sampleRateHz: Settings['recording']['sampleRateHz']) => void
  onSelectRecordingDevice: (deviceId: string) => void
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
}

const recordingMethodOptions: Array<{ value: Settings['recording']['method']; label: string }> = [{ value: 'cpal', label: 'CPAL' }]

const recordingSampleRateOptions: Array<{ value: Settings['recording']['sampleRateHz']; label: string }> = [
  { value: 16000, label: '16 kHz (optimized for speech)' },
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' }
]

const sttProviderOptions: Array<{ value: Settings['transcription']['provider']; label: string }> = [
  { value: 'groq', label: 'Groq' },
  { value: 'elevenlabs', label: 'ElevenLabs' }
]

export const SettingsRecordingReact = ({
  settings,
  audioInputSources,
  audioSourceHint,
  onRefreshAudioSources,
  onSelectRecordingMethod,
  onSelectRecordingSampleRate,
  onSelectRecordingDevice,
  onSelectTranscriptionProvider,
  onSelectTranscriptionModel
}: SettingsRecordingReactProps) => {
  const [selectedRecordingMethod, setSelectedRecordingMethod] = useState<Settings['recording']['method']>(settings.recording.method)
  const [selectedSampleRate, setSelectedSampleRate] = useState<Settings['recording']['sampleRateHz']>(settings.recording.sampleRateHz)
  const [selectedRecordingDevice, setSelectedRecordingDevice] = useState(settings.recording.device)
  const [selectedProvider, setSelectedProvider] = useState<Settings['transcription']['provider']>(settings.transcription.provider)
  const [selectedModel, setSelectedModel] = useState<Settings['transcription']['model']>(settings.transcription.model)
  const [refreshPending, setRefreshPending] = useState(false)

  useEffect(() => {
    setSelectedRecordingMethod(settings.recording.method)
    setSelectedSampleRate(settings.recording.sampleRateHz)
    setSelectedRecordingDevice(settings.recording.device)
    setSelectedProvider(settings.transcription.provider)
    setSelectedModel(settings.transcription.model)
  }, [
    settings.recording.method,
    settings.recording.sampleRateHz,
    settings.recording.device,
    settings.transcription.provider,
    settings.transcription.model
  ])

  const availableModels = STT_MODEL_ALLOWLIST[selectedProvider]

  return createElement(
    'section',
    { className: 'settings-group' },
    createElement('h3', null, 'Recording'),
    createElement('p', { className: 'muted' }, 'Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.'),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Recording method'),
      createElement(
        'select',
        {
          id: 'settings-recording-method',
          value: selectedRecordingMethod,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const method = event.target.value as Settings['recording']['method']
            setSelectedRecordingMethod(method)
            onSelectRecordingMethod(method)
          }
        },
        ...recordingMethodOptions.map((option) =>
          createElement('option', { key: option.value, value: option.value }, option.label)
        )
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Sample rate'),
      createElement(
        'select',
        {
          id: 'settings-recording-sample-rate',
          value: String(selectedSampleRate),
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const sampleRate = Number(event.target.value) as Settings['recording']['sampleRateHz']
            setSelectedSampleRate(sampleRate)
            onSelectRecordingSampleRate(sampleRate)
          }
        },
        ...recordingSampleRateOptions.map((option) =>
          createElement('option', { key: String(option.value), value: String(option.value) }, option.label)
        )
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Audio source'),
      createElement(
        'select',
        {
          id: 'settings-recording-device',
          value: selectedRecordingDevice,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const deviceId = event.target.value
            setSelectedRecordingDevice(deviceId)
            onSelectRecordingDevice(deviceId)
          }
        },
        ...audioInputSources.map((source) =>
          createElement('option', { key: source.id, value: source.id }, source.label)
        )
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'STT provider'),
      createElement(
        'select',
        {
          id: 'settings-transcription-provider',
          value: selectedProvider,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const provider = event.target.value as Settings['transcription']['provider']
            const nextModel = STT_MODEL_ALLOWLIST[provider][0]
            setSelectedProvider(provider)
            setSelectedModel(nextModel)
            onSelectTranscriptionProvider(provider)
          }
        },
        ...sttProviderOptions.map((option) =>
          createElement('option', { key: option.value, value: option.value }, option.label)
        )
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'STT model'),
      createElement(
        'select',
        {
          id: 'settings-transcription-model',
          value: selectedModel,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const model = event.target.value as Settings['transcription']['model']
            setSelectedModel(model)
            onSelectTranscriptionModel(model)
          }
        },
        ...availableModels.map((model) => createElement('option', { key: model, value: model }, model))
      )
    ),
    createElement(
      'div',
      { className: 'settings-actions' },
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-refresh-audio-sources',
          disabled: refreshPending,
          onClick: () => {
            setRefreshPending(true)
            void onRefreshAudioSources().finally(() => {
              setRefreshPending(false)
            })
          }
        },
        'Refresh audio sources'
      )
    ),
    createElement('p', { className: 'muted', id: 'settings-audio-sources-message' }, audioSourceHint),
    createElement(
      'a',
      {
        className: 'inline-link',
        href: 'https://github.com/massun-onibakuchi/speech-to-text-app/issues/8',
        target: '_blank',
        rel: 'noreferrer'
      },
      'View roadmap item'
    )
  )
}
