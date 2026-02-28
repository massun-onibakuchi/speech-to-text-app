/*
Where: src/renderer/settings-endpoint-overrides-react.tsx
What: React-rendered LLM base URL override control in the Settings LLM Transformation section.
Why: Issue #197 — STT base URL override moved into SettingsSttProviderFormReact alongside the
     STT provider form; this component now handles only the LLM (transformation) URL override.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { resolveLlmBaseUrlOverride, type Settings } from '../shared/domain'

interface SettingsEndpointOverridesReactProps {
  settings: Settings
  transformationBaseUrlError: string
  onChangeTransformationBaseUrlDraft: (value: string) => void
  onResetTransformationBaseUrlDraft: () => void
}

export const SettingsEndpointOverridesReact = ({
  settings,
  transformationBaseUrlError,
  onChangeTransformationBaseUrlDraft,
  onResetTransformationBaseUrlDraft
}: SettingsEndpointOverridesReactProps) => {
  const defaultPreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
    settings.transformation.presets[0]
  const [transformationBaseUrl, setTransformationBaseUrl] = useState(
    resolveLlmBaseUrlOverride(settings, defaultPreset?.provider ?? 'google') ?? ''
  )

  useEffect(() => {
    setTransformationBaseUrl(resolveLlmBaseUrlOverride(settings, defaultPreset?.provider ?? 'google') ?? '')
  }, [settings, defaultPreset?.provider])

  return (
    <div className="space-y-3">
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
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-transformation-base-url">
        {transformationBaseUrlError}
      </p>
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
