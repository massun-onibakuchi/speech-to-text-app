/*
 * Where: src/renderer/shell-chrome-react.tsx
 * What: Compact app header bar — recording state indicator only.
 * Why: STY-02 re-architecture moves the tab rail into the right workspace panel;
 *      the header is now a fixed visual anchor that shows global recording state
 *      without a branded icon near the macOS traffic lights.
 *
 * UX rationale:
 *   • State dot in the header gives permanent visual feedback without occupying
 *     the content area — the user always knows if recording is active.
 *   • animate-pulse on the recording dot uses the minimal-motion pattern defined
 *     in docs/ui-design-guidelines.md rather than decorative entrance animation.
 */

import { cn } from './lib/utils'

interface ShellChromeReactProps {
  isRecording: boolean
}

export const ShellChromeReact = ({ isRecording }: ShellChromeReactProps) => {
  const isDarwin = window.electronPlatform === 'darwin'

  return (
    <header
      className={cn(
        'flex items-center justify-end border-b px-4 py-2 bg-card/50',
        'app-region-drag select-none',
        isDarwin ? 'pl-[var(--traffic-light-clearance)]' : 'pr-[var(--titlebar-overlay-clearance)]'
      )}
    >
      {/* Recording state dot: persistent global feedback per UI Design Guidelines header contract */}
      <div className="flex items-center gap-1.5 app-region-no-drag" aria-live="polite" aria-atomic="true">
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
}
