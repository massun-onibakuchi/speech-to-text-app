/*
Where: src/renderer/settings-recording-react.tsx
What: React-rendered Settings recording controls section.
Why: Continue Settings migration to React while preserving selectors and behavior parity.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
     Issue #299: migrated all five select controls from native <select> to Radix Select primitive
     for cross-platform popup/item theming via app design tokens.
*/

import { useEffect, useState } from 'react'
import { STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import type { AudioInputSource } from '../shared/ipc'
import {
  STT_MODEL_LABELS,
  STT_PROVIDER_LABELS,
  supportsLocalSttSelection,
  type RuntimePlatformInfo
} from '../shared/local-stt'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'

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
  const runtimePlatform: RuntimePlatformInfo = {
    platform: window.electronPlatform ?? 'unknown',
    arch: window.electronArch ?? 'unknown'
  }
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
  const sttProviderOptions = (Object.entries(STT_PROVIDER_LABELS) as Array<
    [Settings['transcription']['provider'], string]
  >)
    .map(([value, label]) => ({ value, label }))
    .filter((option) => supportsLocalSttSelection(runtimePlatform) || option.value !== 'local_whisperlivekit')

  return (
    <section className="space-y-3">
      {showLegacyHeading && (
        <>
          <h3>Recording</h3>
        </>
      )}
      {renderSpeechToTextControls && (
        <>
          <p className="text-[11px] text-muted-foreground" id="settings-help-stt-language">
            STT language defaults to auto-detect. Advanced override: set `transcription.outputLanguage` in the settings file to an ISO language code (for example `en` or `ja`).
          </p>
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">STT provider</span>
            <Select
              value={selectedProvider}
              onValueChange={(val) => {
                const provider = val as Settings['transcription']['provider']
                const nextModel = STT_MODEL_ALLOWLIST[provider][0]
                setSelectedProvider(provider)
                setSelectedModel(nextModel)
                onSelectTranscriptionProvider(provider)
              }}
            >
              <SelectTrigger
                id="settings-transcription-provider"
                data-testid="select-recording-transcription-provider"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sttProviderOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">STT model</span>
            <Select
              value={selectedModel}
              onValueChange={(val) => {
                const model = val as Settings['transcription']['model']
                setSelectedModel(model)
                onSelectTranscriptionModel(model)
              }}
            >
              <SelectTrigger
                id="settings-transcription-model"
                data-testid="select-recording-transcription-model"
                className="font-mono"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model} className="font-mono">{STT_MODEL_LABELS[model]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {renderAudioControls && (
        <>
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Recording method</span>
            <Select
              value={selectedRecordingMethod}
              onValueChange={(val) => {
                const method = val as Settings['recording']['method']
                setSelectedRecordingMethod(method)
                onSelectRecordingMethod(method)
              }}
            >
              <SelectTrigger id="settings-recording-method" data-testid="select-recording-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recordingMethodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Sample rate</span>
            <Select
              value={String(selectedSampleRate)}
              onValueChange={(val) => {
                const sampleRate = Number(val) as Settings['recording']['sampleRateHz']
                setSelectedSampleRate(sampleRate)
                onSelectRecordingSampleRate(sampleRate)
              }}
            >
              <SelectTrigger id="settings-recording-sample-rate" data-testid="select-recording-sample-rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recordingSampleRateOptions.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">Audio source</span>
            <Select
              value={selectedRecordingDevice}
              onValueChange={(deviceId) => {
                setSelectedRecordingDevice(deviceId)
                onSelectRecordingDevice(deviceId)
              }}
            >
              <SelectTrigger id="settings-recording-device" data-testid="select-recording-device" className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audioInputSources.map((source) => (
                  <SelectItem key={source.id} value={source.id} className="font-mono">{source.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
