/*
Where: src/renderer/settings-streaming-react.tsx
What: Streaming mode settings controls for raw dictation rollout.
Why: PR-8 needs one explicit place for mode/provider/language choices without
     exposing transformed streaming before its backend contract exists.
*/

import type {
  Settings,
  SettingsProcessingMode,
  StreamingLanguage,
  StreamingProvider
} from '../shared/domain'
import { cn } from './lib/utils'
import {
  DEFAULT_STREAMING_OUTPUT_MODE,
  STREAMING_LANGUAGE_LABELS,
  STREAMING_PROVIDER_HELP,
  STREAMING_PROVIDER_LABELS,
  resolveStreamingProviderDefaults
} from './streaming-settings'

interface SettingsStreamingReactProps {
  settings: Settings
  onSelectProcessingMode: (mode: SettingsProcessingMode) => void
  onSelectStreamingProvider: (provider: StreamingProvider) => void
  onSelectStreamingLanguage: (language: StreamingLanguage) => void
}

const cardClassName = (selected: boolean, disabled = false): string =>
  cn(
    'rounded-lg border p-3 text-left transition-colors',
    disabled && 'cursor-not-allowed opacity-60',
    !disabled && 'cursor-pointer hover:bg-accent',
    selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
  )

export const SettingsStreamingReact = ({
  settings,
  onSelectProcessingMode,
  onSelectStreamingProvider,
  onSelectStreamingLanguage
}: SettingsStreamingReactProps) => {
  const isStreamingMode = settings.processing.mode === 'streaming'
  const selectedProvider = settings.processing.streaming.provider ?? 'local_whispercpp_coreml'
  const selectedLanguage = settings.processing.streaming.language
  const providerDefaults = resolveStreamingProviderDefaults(selectedProvider)

  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Streaming mode sends live audio frames into the raw dictation stream. Batch raw dictation,
        transformed text, and transform-only shortcuts remain available in Default mode.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-foreground">Processing Mode</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {([
            ['default', 'Default', 'Batch capture. Existing raw dictation and transformed output stay unchanged.'],
            ['streaming', 'Streaming', 'Live raw dictation only. Output is paste-only until transformed streaming lands.']
          ] as const).map(([mode, label, help]) => (
            <button
              key={mode}
              type="button"
              className={cardClassName(settings.processing.mode === mode)}
              data-processing-mode-card={mode}
              onClick={() => {
                if (settings.processing.mode !== mode) {
                  onSelectProcessingMode(mode)
                }
              }}
            >
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{help}</p>
              </div>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-foreground">Streaming Provider</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {(Object.keys(STREAMING_PROVIDER_LABELS) as StreamingProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              className={cardClassName(selectedProvider === provider, !isStreamingMode)}
              data-streaming-provider-card={provider}
              disabled={!isStreamingMode}
              onClick={() => {
                if (isStreamingMode && selectedProvider !== provider) {
                  onSelectStreamingProvider(provider)
                }
              }}
            >
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">{STREAMING_PROVIDER_LABELS[provider]}</p>
                <p className="text-[10px] text-muted-foreground">{STREAMING_PROVIDER_HELP[provider]}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-3" data-streaming-provider-summary>
          <p className="text-[10px] text-muted-foreground">Resolved runtime</p>
          <p className="mt-1 font-mono text-[11px] text-foreground">
            {providerDefaults.transport} / {providerDefaults.model}
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-foreground">Language</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {(Object.keys(STREAMING_LANGUAGE_LABELS) as StreamingLanguage[]).map((language) => (
            <button
              key={language}
              type="button"
              className={cardClassName(selectedLanguage === language, !isStreamingMode)}
              data-streaming-language-card={language}
              disabled={!isStreamingMode}
              onClick={() => {
                if (isStreamingMode && selectedLanguage !== language) {
                  onSelectStreamingLanguage(language)
                }
              }}
            >
              <span className="text-xs text-foreground">{STREAMING_LANGUAGE_LABELS[language]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-foreground">Streaming Output</legend>
        <div className="grid gap-2 md:grid-cols-2">
          <div
            className={cardClassName(true)}
            data-streaming-output-card={DEFAULT_STREAMING_OUTPUT_MODE}
          >
            <p className="text-xs font-medium text-foreground">Raw dictation stream</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Finalized segments paste at the cursor in commit order.
            </p>
          </div>
          <div
            className={cardClassName(false, true)}
            data-streaming-output-card="stream_transformed"
          >
            <p className="text-xs font-medium text-foreground">Transformed streaming</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Hidden from shipping UX until the structured transform context contract lands.
            </p>
          </div>
        </div>
      </fieldset>
    </section>
  )
}
