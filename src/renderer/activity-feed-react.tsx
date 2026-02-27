/*
 * Where: src/renderer/activity-feed-react.tsx
 * What: Activity feed tab React component — placeholder for STY-04.
 * Why: STY-02 requires this component slot to exist so the tabbed workspace can mount;
 *      full card/status/transcript implementation lands in STY-04.
 */

import { Loader2 } from 'lucide-react'
import type { ActivityItem } from './activity-feed'

interface ActivityFeedReactProps {
  activity: ActivityItem[]
}

export const ActivityFeedReact = ({ activity }: ActivityFeedReactProps) => {
  if (activity.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground p-8">
        <Loader2 className="size-8 opacity-20" />
        <p className="text-xs text-center">No activity yet.</p>
        <p className="text-[11px] text-center">Recordings will appear here after transcription.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-2">
      {activity.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border bg-card p-3 text-xs text-muted-foreground"
        >
          <span className="text-[10px] font-mono mr-2 text-muted-foreground/60">{item.createdAt}</span>
          {item.message}
        </div>
      ))}
    </div>
  )
}
