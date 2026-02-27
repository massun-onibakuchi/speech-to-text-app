/*
 * Where: src/renderer/profiles-panel-react.tsx
 * What: Profiles panel tab React component — placeholder for STY-05.
 * Why: STY-02 requires this component slot to exist so the tabbed workspace can mount;
 *      full card/inline-edit implementation lands in STY-05.
 */

import { Zap } from 'lucide-react'

// Props will be expanded in STY-05 to include profile data and handlers.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ProfilesPanelReactProps {
  // Intentionally empty for the STY-02 placeholder — expanded in STY-05.
}

export const ProfilesPanelReact = (_props: ProfilesPanelReactProps) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground p-8">
    <Zap className="size-8 opacity-20" />
    <p className="text-xs text-center">Profiles panel.</p>
    <p className="text-[11px] text-center">Transformation profiles will appear here.</p>
  </div>
)
