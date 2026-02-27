/*
 * Where: src/renderer/status-bar-react.tsx
 * What: Status bar footer React component — placeholder for STY-07.
 * Why: STY-02 requires a footer component to complete the shell architecture;
 *      full metadata/connectivity implementation lands in STY-07.
 */

import { Cpu, Mic, Wifi } from 'lucide-react'
import type { Settings } from '../shared/domain'

interface StatusBarReactProps {
  settings: Settings
}

export const StatusBarReact = ({ settings }: StatusBarReactProps) => (
  <footer className="flex items-center justify-between border-t bg-card/50 px-4 py-1.5">
    {/* Left cluster: STT provider/model + LLM provider + audio device */}
    <div className="flex items-center gap-4 text-muted-foreground">
      <span className="flex items-center gap-1">
        <Mic className="size-3" />
        <span className="font-mono text-[10px]">
          {settings.transcription.provider}/{settings.transcription.model}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <Cpu className="size-3" />
        <span className="font-mono text-[10px]">
          {settings.transformation.autoRunDefaultTransform ? 'auto-transform on' : 'manual'}
        </span>
      </span>
    </div>
    {/* Right cluster: connectivity */}
    <div className="flex items-center gap-3 text-muted-foreground">
      <span className="flex items-center gap-1">
        <Wifi className="size-3 text-success" />
        <span className="text-[10px]">Ready</span>
      </span>
    </div>
  </footer>
)
