/*
Where: src/renderer/settings-endpoint-overrides-react.ts
What: React-rendered Settings endpoint override controls for STT and LLM providers.
Why: Continue Settings migration by moving endpoint override control ownership into React.
*/

import { createElement } from 'react'
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
  const activePreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.activePresetId) ??
    settings.transformation.presets[0]
  const [transcriptionBaseUrl, setTranscriptionBaseUrl] = useState(
    resolveSttBaseUrlOverride(settings, settings.transcription.provider) ?? ''
  )
  const [transformationBaseUrl, setTransformationBaseUrl] = useState(
    resolveLlmBaseUrlOverride(settings, activePreset?.provider ?? 'google') ?? ''
  )

  useEffect(() => {
    setTranscriptionBaseUrl(resolveSttBaseUrlOverride(settings, settings.transcription.provider) ?? '')
    setTransformationBaseUrl(resolveLlmBaseUrlOverride(settings, activePreset?.provider ?? 'google') ?? '')
  }, [settings, settings.transcription.provider, activePreset?.provider])

  return createElement(
    'div',
    null,
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'STT base URL override (optional)'),
      createElement('input', {
        id: 'settings-transcription-base-url',
        type: 'url',
        placeholder: 'https://stt-proxy.local',
        value: transcriptionBaseUrl,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const value = event.target.value
          setTranscriptionBaseUrl(value)
          onChangeTranscriptionBaseUrlDraft(value)
        }
      })
    ),
    createElement('p', { className: 'field-error', id: 'settings-error-transcription-base-url' }, transcriptionBaseUrlError),
    createElement(
      'div',
      { className: 'settings-actions' },
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-reset-transcription-base-url',
          onClick: () => {
            setTranscriptionBaseUrl('')
            onResetTranscriptionBaseUrlDraft()
          }
        },
        'Reset STT URL to default'
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'LLM base URL override (optional)'),
      createElement('input', {
        id: 'settings-transformation-base-url',
        type: 'url',
        placeholder: 'https://llm-proxy.local',
        value: transformationBaseUrl,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const value = event.target.value
          setTransformationBaseUrl(value)
          onChangeTransformationBaseUrlDraft(value)
        }
      })
    ),
    createElement('p', { className: 'field-error', id: 'settings-error-transformation-base-url' }, transformationBaseUrlError),
    createElement(
      'div',
      { className: 'settings-actions' },
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-reset-transformation-base-url',
          onClick: () => {
            setTransformationBaseUrl('')
            onResetTransformationBaseUrlDraft()
          }
        },
        'Reset LLM URL to default'
      )
    )
  )
}
