/*
 * Where: src/renderer/activity-feed-react.tsx
 * What: Activity feed tab component — job card list with spec-compliant status visuals.
 * Why: STY-04 full implementation; replaces the STY-02 placeholder.
 *
 * Data contract decision: docs/decisions/activity-feed-data-contract.md
 *   • ActivityItem.tone maps to semantic border and status icon.
 *   • message is the primary card content (transcript/transform split not yet in IPC model).
 *   • createdAt is shown as the timestamp.
 *
 * UX rationale (spec section 6.3, 7, 8):
 *   • Semantic border (success/destructive/default) lets users scan status at a glance
 *     without relying on color alone — always paired with an icon.
 *   • Hover-reveal copy button uses opacity transition per spec section 7 rules.
 *   • Empty state: Loader2 opacity-20 + muted text — unobtrusive, not alarming.
 */

import { Activity, Check, CheckCircle, Copy, Loader2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ActivityItem } from './activity-feed'
import { cn } from './lib/utils'

interface ActivityFeedReactProps {
  activity: ActivityItem[]
}

const COPY_SUCCESS_MS = 1500

// Resolve semantic border class from tone per spec section 6.3
const borderClass = (tone: ActivityItem['tone']): string => {
  if (tone === 'success') return 'border-success/20'
  if (tone === 'error') return 'border-destructive/30'
  return '' // default border via @layer base
}

// Status icon + badge label per spec section 6.3
const StatusIcon = ({ tone }: { tone: ActivityItem['tone'] }) => {
  if (tone === 'success') {
    return <CheckCircle className="size-3 text-success shrink-0" aria-hidden="true" />
  }
  if (tone === 'error') {
    return <XCircle className="size-3 text-destructive shrink-0" aria-hidden="true" />
  }
  // info = in-progress; animate-spin per spec section 7
  return <Activity className="size-3 text-muted-foreground shrink-0 animate-spin" aria-hidden="true" />
}

const StatusBadge = ({ tone }: { tone: ActivityItem['tone'] }) => {
  const label = tone === 'success' ? 'Succeeded' : tone === 'error' ? 'Failed' : 'Processing'
  const cls =
    tone === 'success'
      ? 'bg-success/10 text-success border-success/20'
      : tone === 'error'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-muted text-muted-foreground border-border'
  return (
    <span className={cn('text-[10px] h-4 px-1.5 rounded border inline-flex items-center', cls)}>
      {label}
    </span>
  )
}

// Single copy-to-clipboard action button revealed on hover per spec section 6.3
const CopyButton = ({
  label,
  copied,
  onCopy
}: {
  label: string
  copied: boolean
  onCopy: () => Promise<void>
}) => {
  return (
    <button
      type="button"
      aria-label={label}
      data-copy-state={copied ? 'copied' : 'idle'}
      onClick={() => { void onCopy() }}
      className="p-1 rounded bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-success" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      <span className="sr-only">{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  )
}

// Individual activity card
const ActivityCard = ({
  item,
  copied,
  onCopy
}: {
  item: ActivityItem
  copied: boolean
  onCopy: (itemId: number, message: string) => Promise<void>
}) => (
  <article
    className={cn(
      'rounded-lg border bg-card p-3 transition-colors',
      borderClass(item.tone)
    )}
    aria-label={`Activity: ${item.tone}`}
  >
    {/* Status row: icon + badge + timestamp */}
    <div className="flex items-center gap-1.5 mb-2">
      <StatusIcon tone={item.tone} />
      <StatusBadge tone={item.tone} />
      <span className="ml-auto text-[10px] font-mono text-muted-foreground">{item.createdAt}</span>
    </div>

    {/* Message text block (serves as transcript/transform content per data contract decision) */}
    <div className="group/text relative">
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {item.message}
      </p>
      {/* Hover-reveal copy action per spec section 6.3 */}
      <div className="absolute top-0 right-0 opacity-0 group-hover/text:opacity-100 transition-opacity">
        <CopyButton label="Copy message" copied={copied} onCopy={async () => onCopy(item.id, item.message)} />
      </div>
    </div>
  </article>
)

export const ActivityFeedReact = ({ activity }: ActivityFeedReactProps) => {
  const [copiedById, setCopiedById] = useState<Record<number, boolean>>({})
  const copyResetTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const clearCopyTimer = (itemId: number): void => {
    const timer = copyResetTimersRef.current.get(itemId)
    if (timer === undefined) {
      return
    }
    clearTimeout(timer)
    copyResetTimersRef.current.delete(itemId)
  }

  const markCopied = (itemId: number): void => {
    setCopiedById((previous) => ({ ...previous, [itemId]: true }))
    clearCopyTimer(itemId)
    const timer = setTimeout(() => {
      copyResetTimersRef.current.delete(itemId)
      setCopiedById((previous) => {
        if (!previous[itemId]) {
          return previous
        }
        const next = { ...previous }
        delete next[itemId]
        return next
      })
    }, COPY_SUCCESS_MS)
    copyResetTimersRef.current.set(itemId, timer)
  }

  const handleCopy = async (itemId: number, message: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message)
      markCopied(itemId)
    } catch {
      // clipboard may be unavailable in test env — no-op
    }
  }

  useEffect(() => {
    return () => {
      for (const timer of copyResetTimersRef.current.values()) {
        clearTimeout(timer)
      }
      copyResetTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const activeIds = new Set(activity.map((item) => item.id))
    for (const itemId of copyResetTimersRef.current.keys()) {
      if (!activeIds.has(itemId)) {
        clearCopyTimer(itemId)
      }
    }
    setCopiedById((previous) => {
      const nextEntries = Object.entries(previous).filter(([itemId]) => activeIds.has(Number(itemId)))
      if (nextEntries.length === Object.keys(previous).length) {
        return previous
      }
      return Object.fromEntries(nextEntries)
    })
  }, [activity])

  if (activity.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground p-8">
        <Loader2 className="size-8 opacity-20" aria-hidden="true" />
        <p className="text-xs text-center">No activity yet.</p>
        <p className="text-[11px] text-center text-muted-foreground/60">
          Recordings will appear here after transcription.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-2" role="log" aria-label="Activity feed" aria-live="polite">
      {activity.map((item) => (
        <ActivityCard key={item.id} item={item} copied={copiedById[item.id] === true} onCopy={handleCopy} />
      ))}
    </div>
  )
}
