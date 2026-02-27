/*
Where: src/renderer/settings-endpoint-overrides-react.tsx
What: React-rendered Settings endpoint override controls for STT and LLM providers.
Why: Continue Settings migration by moving endpoint override control ownership into React.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { resolveLlmBaseUrlOverride, resolveSttBaseUrlOverride, type Settings } from '../shared/domain'

interface SettingsEndpointOverridesReactProps {
  settings: Settings
  transcriptionBaseUrlError: string
  transformationBaseUrlError: string
  onChangeTranscriptionBaseUrlDraft: (value: string) => void
  onChangeTransformationBaseUrlDraft: (value: string) => void
  onResetTranscriptionBaseUrlDraft: () => void
  onResetTransformationBaseUrlDraft: () => void
}

export const SettingsEndpointOverridesReact = ({
  settings,
  transcriptionBaseUrlError,
  transformationBaseUrlError,
  onChangeTranscriptionBaseUrlDraft,
  onChangeTransformationBaseUrlDraft,
  onResetTranscriptionBaseUrlDraft,
  onResetTransformationBaseUrlDraft
}: SettingsEndpointOverridesReactProps) => {
  const defaultPreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
    settings.transformation.presets[0]
  const [transcriptionBaseUrl, setTranscriptionBaseUrl] = useState(
    resolveSttBaseUrlOverride(settings, settings.transcription.provider) ?? ''
  )
  const [transformationBaseUrl, setTransformationBaseUrl] = useState(
    resolveLlmBaseUrlOverride(settings, defaultPreset?.provider ?? 'google') ?? ''
  )

  useEffect(() => {
    setTranscriptionBaseUrl(resolveSttBaseUrlOverride(settings, settings.transcription.provider) ?? '')
    setTransformationBaseUrl(resolveLlmBaseUrlOverride(settings, defaultPreset?.provider ?? 'google') ?? '')
  }, [settings, settings.transcription.provider, defaultPreset?.provider])

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5 text-xs">
        <span>STT base URL override (optional)</span>
        <input
          id="settings-transcription-base-url"
          type="url"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          placeholder="https://stt-proxy.local"
          value={transcriptionBaseUrl}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setTranscriptionBaseUrl(value)
            onChangeTranscriptionBaseUrlDraft(value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-transcription-base-url">{transcriptionBaseUrlError}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          id="settings-reset-transcription-base-url"
          className="h-7 rounded bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          onClick={() => {
            setTranscriptionBaseUrl('')
            onResetTranscriptionBaseUrlDraft()
          }}
        >
          Reset STT URL to default
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>LLM base URL override (optional)</span>
        <input
          id="settings-transformation-base-url"
          type="url"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          placeholder="https://llm-proxy.local"
          value={transformationBaseUrl}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setTransformationBaseUrl(value)
            onChangeTransformationBaseUrlDraft(value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-transformation-base-url">{transformationBaseUrlError}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          id="settings-reset-transformation-base-url"
          className="h-7 rounded bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          onClick={() => {
            setTransformationBaseUrl('')
            onResetTransformationBaseUrlDraft()
          }}
        >
          Reset LLM URL to default
        </button>
      </div>
    </div>
  )
}
