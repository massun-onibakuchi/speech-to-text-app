/*
Where: src/renderer/local-runtime-panel-react.tsx
What: Settings-side status and actions panel for the optional local WhisperLiveKit runtime.
Why: Users need explicit consent, progress visibility, and install lifecycle actions when the local provider is selected.
*/

import type { LocalRuntimeStatusSnapshot } from '../shared/local-runtime'
import { cn } from './lib/utils'

interface LocalRuntimePanelReactProps {
  status: LocalRuntimeStatusSnapshot
  onInstall: () => Promise<void>
  onCancel: () => Promise<void>
  onUninstall: () => Promise<void>
}

const resolveBadgeTone = (state: LocalRuntimeStatusSnapshot['state']): string => {
  switch (state) {
    case 'ready':
      return 'border-success/40 bg-success/10 text-success'
    case 'installing':
    case 'awaiting_user_confirmation':
      return 'border-primary/30 bg-primary/10 text-primary'
    case 'failed':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    default:
      return 'border-border bg-muted/30 text-muted-foreground'
  }
}

const resolvePrimaryActionLabel = (status: LocalRuntimeStatusSnapshot): string => {
  if (status.state === 'ready') {
    return 'Reinstall runtime'
  }
  if (status.requiresUpdate) {
    return 'Update runtime'
  }
  return 'Install runtime'
}

export const LocalRuntimePanelReact = ({
  status,
  onInstall,
  onCancel,
  onUninstall
}: LocalRuntimePanelReactProps) => {
  return (
    <section
      aria-label="Local runtime"
      className="rounded-lg border border-border/70 bg-card/60 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-foreground">Local runtime</h4>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                resolveBadgeTone(status.state)
              )}
            >
              {status.state.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{status.summary}</p>
          {status.detail && (
            <p className="text-[11px] text-muted-foreground">{status.detail}</p>
          )}
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          <div>Required version</div>
          <div className="font-mono text-foreground">{status.manifest.version}</div>
        </div>
      </div>

      {(status.installedVersion || status.runtimeRoot) && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {status.installedVersion && (
            <>
              <dt>Installed</dt>
              <dd className="font-mono text-foreground">{status.installedVersion}</dd>
            </>
          )}
          <dt>Backend</dt>
          <dd className="font-mono text-foreground">{status.manifest.backend}</dd>
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!status.canRequestInstall}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            void onInstall()
          }}
        >
          {resolvePrimaryActionLabel(status)}
        </button>
        <button
          type="button"
          disabled={!status.canCancel}
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            void onCancel()
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!status.canUninstall}
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            void onUninstall()
          }}
        >
          Uninstall
        </button>
      </div>
    </section>
  )
}
