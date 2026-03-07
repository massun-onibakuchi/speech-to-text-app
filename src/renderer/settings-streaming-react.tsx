/*
Where: src/renderer/settings-streaming-react.tsx
What: Streaming mode settings controls for raw and transformed streaming output.
Why: Keep streaming mode selection explicit while preserving batch-mode behavior
     and locking edits when a live session is active.
*/

import type {
  Settings,
  SettingsProcessingMode,
  StreamingLanguage,
  StreamingOutputMode,
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
  isLocked: boolean
  onSelectProcessingMode: (mode: SettingsProcessingMode) => void
  onSelectStreamingProvider: (provider: StreamingProvider) => void
  onSelectStreamingLanguage: (language: StreamingLanguage) => void
  onSelectStreamingOutputMode: (outputMode: StreamingOutputMode) => void
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
  isLocked,
  onSelectProcessingMode,
  onSelectStreamingProvider,
  onSelectStreamingLanguage,
  onSelectStreamingOutputMode
}: SettingsStreamingReactProps) => {
  const isStreamingMode = settings.processing.mode === 'streaming'
  const selectedProvider = settings.processing.streaming.provider ?? 'local_whispercpp_coreml'
  const selectedLanguage = settings.processing.streaming.language
  const selectedOutputMode = settings.processing.streaming.outputMode ?? DEFAULT_STREAMING_OUTPUT_MODE
  const providerDefaults = resolveStreamingProviderDefaults(selectedProvider)

  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Streaming mode sends live audio frames into a session-scoped dictation lane. Batch raw
        dictation, batch transformed text, and transform-only shortcuts remain available in Default mode.
      </p>
      {isLocked ? (
        <p className="text-[10px] text-warning" data-streaming-settings-lock-note>
          Stop the active streaming session before changing mode, provider, or language.
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-foreground">Processing Mode</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {([
            ['default', 'Default', 'Batch capture. Existing raw dictation and transformed output stay unchanged.'],
            ['streaming', 'Streaming', 'Live raw or transformed segment commit. Output remains paste-only in streaming mode.']
          ] as const).map(([mode, label, help]) => (
            <button
              key={mode}
              type="button"
              className={cardClassName(settings.processing.mode === mode, isLocked)}
              data-processing-mode-card={mode}
              disabled={isLocked}
              onClick={() => {
                if (!isLocked && settings.processing.mode !== mode) {
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
              className={cardClassName(selectedProvider === provider, !isStreamingMode || isLocked)}
              data-streaming-provider-card={provider}
              disabled={!isStreamingMode || isLocked}
              onClick={() => {
                if (isStreamingMode && !isLocked && selectedProvider !== provider) {
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
              className={cardClassName(selectedLanguage === language, !isStreamingMode || isLocked)}
              data-streaming-language-card={language}
              disabled={!isStreamingMode || isLocked}
              onClick={() => {
                if (isStreamingMode && !isLocked && selectedLanguage !== language) {
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
          {([
            ['stream_raw_dictation', 'Raw dictation stream', 'Finalized source segments paste at the cursor in commit order.'],
            ['stream_transformed', 'Transformed streaming', 'Finalized segments transform concurrently, commit in source order, and fall back to raw on segment failure.']
          ] as const).map(([outputMode, label, help]) => (
            <button
              key={outputMode}
              type="button"
              className={cardClassName(selectedOutputMode === outputMode, !isStreamingMode || isLocked)}
              data-streaming-output-card={outputMode}
              disabled={!isStreamingMode || isLocked}
              onClick={() => {
                if (isStreamingMode && !isLocked && selectedOutputMode !== outputMode) {
                  onSelectStreamingOutputMode(outputMode)
                }
              }}
            >
              <p className="text-xs font-medium text-foreground">{label}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{help}</p>
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
