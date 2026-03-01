/*
Where: src/renderer/settings-recording-react.tsx
What: React-rendered Settings recording controls section.
Why: Continue Settings migration to React while preserving selectors and behavior parity.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
     Issue #255: standardized select-like controls to app design-token pattern.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import type { AudioInputSource } from '../shared/ipc'

interface SettingsRecordingReactProps {
  settings: Settings
  audioInputSources: AudioInputSource[]
  audioSourceHint: string
  section?: 'all' | 'speech-to-text' | 'audio-input'
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

// Shared class set for all select-like controls per issue #255 / style-update.md §4.
// w-full: stretch to section width; rounded-md: matches --radius; bg-input/30 + hover: semi-transparent input surface.
const SELECT_CLS = 'w-full h-8 rounded-md border border-input bg-input/30 hover:bg-input/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors'
const SELECT_MONO_CLS = `${SELECT_CLS} font-mono`

export const SettingsRecordingReact = ({
  settings,
  audioInputSources,
  audioSourceHint,
  section = 'all',
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
  const renderSpeechToTextControls = section === 'all' || section === 'speech-to-text'
  const renderAudioControls = section === 'all' || section === 'audio-input'
  const showLegacyHeading = section === 'all'

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

  return (
    <section className="space-y-3">
      {showLegacyHeading && (
        <>
          <h3>Recording</h3>
          <p className="text-[11px] text-muted-foreground">Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.</p>
        </>
      )}
      {renderSpeechToTextControls && (
        <>
          <p className="text-[11px] text-muted-foreground" id="settings-help-stt-language">
            STT language defaults to auto-detect. Advanced override: set `transcription.outputLanguage` in the settings file to an ISO language code (for example `en` or `ja`).
          </p>
          <label className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">STT provider</span>
            <select
              id="settings-transcription-provider"
              className={SELECT_CLS}
              value={selectedProvider}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const provider = event.target.value as Settings['transcription']['provider']
                const nextModel = STT_MODEL_ALLOWLIST[provider][0]
                setSelectedProvider(provider)
                setSelectedModel(nextModel)
                onSelectTranscriptionProvider(provider)
              }}
            >
              {sttProviderOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">STT model</span>
            <select
              id="settings-transcription-model"
              className={SELECT_MONO_CLS}
              value={selectedModel}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const model = event.target.value as Settings['transcription']['model']
                setSelectedModel(model)
                onSelectTranscriptionModel(model)
              }}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {renderAudioControls && (
        <>
          {!showLegacyHeading && (
            <p className="text-[11px] text-muted-foreground">Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.</p>
          )}
          <label className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Recording method</span>
            <select
              id="settings-recording-method"
              className={SELECT_CLS}
              value={selectedRecordingMethod}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const method = event.target.value as Settings['recording']['method']
                setSelectedRecordingMethod(method)
                onSelectRecordingMethod(method)
              }}
            >
              {recordingMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Sample rate</span>
            <select
              id="settings-recording-sample-rate"
              className={SELECT_CLS}
              value={String(selectedSampleRate)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const sampleRate = Number(event.target.value) as Settings['recording']['sampleRateHz']
                setSelectedSampleRate(sampleRate)
                onSelectRecordingSampleRate(sampleRate)
              }}
            >
              {recordingSampleRateOptions.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Audio source</span>
            <select
              id="settings-recording-device"
              className={SELECT_MONO_CLS}
              value={selectedRecordingDevice}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const deviceId = event.target.value
                setSelectedRecordingDevice(deviceId)
                onSelectRecordingDevice(deviceId)
              }}
            >
              {audioInputSources.map((source) => (
                <option key={source.id} value={source.id}>{source.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="settings-refresh-audio-sources"
              className="h-7 rounded bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
              disabled={refreshPending}
              onClick={() => {
                setRefreshPending(true)
                void onRefreshAudioSources().finally(() => {
                  setRefreshPending(false)
                })
              }}
            >
              Refresh audio sources
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground" id="settings-audio-sources-message">{audioSourceHint}</p>
        </>
      )}
    </section>
  )
}
