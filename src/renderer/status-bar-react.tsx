/*
 * Where: src/renderer/status-bar-react.tsx
 * What: Status bar footer React component for STY-07 metadata/connectivity strip.
 * Why: Keeps compact operational context visible without using color-only status cues.
 */

import { Cpu, Mic, Wifi, WifiOff } from 'lucide-react'
import type { Settings } from '../shared/domain'
import type { StreamingSessionStateSnapshot } from '../shared/ipc'

interface StatusBarReactProps {
  settings: Settings
  ping: string
  streamingSessionState: StreamingSessionStateSnapshot
}

export const StatusBarReact = ({ settings, ping, streamingSessionState }: StatusBarReactProps) => {
  const isReady = ping === 'pong'
  const defaultPreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
    settings.transformation.presets[0]
  const llmProvider = defaultPreset?.provider ?? 'unknown'
  const isStreamingMode = settings.processing.mode === 'streaming'
  const transcriptionLabel = isStreamingMode
    ? `${settings.processing.streaming.provider ?? 'streaming'}/${settings.processing.streaming.model ?? 'pending'}`
    : `${settings.transcription.provider}/${settings.transcription.model}`

  return (
    <footer className="flex items-center justify-between border-t bg-card/50 px-4 py-1.5">
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Mic className="size-3" aria-hidden="true" />
          <span className="font-mono text-[10px]">
            {transcriptionLabel}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="size-3" aria-hidden="true" />
          <span className="font-mono text-[10px]">{llmProvider}</span>
        </span>
        <span className="text-[10px] font-mono">{settings.recording.device}</span>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        {isStreamingMode ? (
          <span className="text-[10px] font-mono text-primary" data-status-streaming-session>
            stream:{streamingSessionState.state}
          </span>
        ) : null}
        <span className="text-[10px] text-primary" data-status-active-profile>
          {defaultPreset?.name ?? 'Default'}
        </span>
        <span className="flex items-center gap-1" data-status-connectivity>
          {isReady ? <Wifi className="size-3 text-success" aria-hidden="true" /> : <WifiOff className="size-3 text-destructive" aria-hidden="true" />}
          <span className="text-[10px]">{isReady ? 'Ready' : 'Offline'}</span>
        </span>
      </div>
    </footer>
  )
}
