/*
 * Where: src/renderer/shell-chrome-react.tsx
 * What: Compact app header bar — logo, app name, recording state dot.
 * Why: STY-02 re-architecture moves the tab rail into the right workspace panel;
 *      the header is now a fixed visual anchor that shows global recording state.
 *
 * UX rationale:
 *   • State dot in the header gives permanent visual feedback without occupying
 *     the content area — the user always knows if recording is active.
 *   • animate-pulse on the recording dot uses a subdued animation pattern (allowed
 *     by spec section 7) rather than a distracting entrance animation.
 */

import { AudioWaveform } from 'lucide-react'
import { cn } from './lib/utils'

interface ShellChromeReactProps {
  isRecording: boolean
}

export const ShellChromeReact = ({ isRecording }: ShellChromeReactProps) => (
  <header className="flex items-center justify-between border-b px-4 py-2 bg-card/50">
    {/* Logo + App name */}
    <div className="flex items-center gap-2">
      <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center">
        <AudioWaveform className="size-3.5 text-primary" aria-hidden="true" />
      </div>
      <span className="text-sm font-semibold tracking-tight">Speech-to-Text v1</span>
    </div>

    {/* Recording state dot: provides persistent global recording feedback per spec section 5.3 */}
    <div className="flex items-center gap-1.5" aria-live="polite" aria-atomic="true">
      <span
        className={cn(
          'size-2 rounded-full',
          isRecording ? 'bg-recording animate-pulse' : 'bg-success'
        )}
        aria-hidden="true"
      />
      <span className="text-[10px] text-muted-foreground">
        {isRecording ? 'Recording' : 'Ready'}
      </span>
    </div>
  </header>
)
