/*
Where: src/renderer/confirm-local-runtime-install-dialog-react.tsx
What: Confirmation dialog for installing or reinstalling the optional local WhisperLiveKit runtime.
Why: Local runtime install is an explicit opt-in action, so the user must confirm before the app mutates app-managed storage or downloads packages.
*/

import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog'

interface ConfirmLocalRuntimeInstallDialogReactProps {
  open: boolean
  pending: boolean
  runtimeVersion: string
  backendLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export const ConfirmLocalRuntimeInstallDialogReact = ({
  open,
  pending,
  runtimeVersion,
  backendLabel,
  onOpenChange,
  onConfirm
}: ConfirmLocalRuntimeInstallDialogReactProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open || pending) {
      return
    }
    cancelButtonRef.current?.focus()
  }, [open, pending])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (pending) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (pending) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Install local streaming runtime?</DialogTitle>
          <DialogDescription>
            Dicta will install WhisperLiveKit {runtimeVersion} with {backendLabel} into app-managed storage.
            This does not modify the signed app bundle.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The install needs Python 3.11 through 3.13 and may take a few minutes the first time.
        </div>
        <DialogFooter>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Not now
          </button>
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void onConfirm()
            }}
          >
            {pending ? 'Installing...' : 'Install runtime'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
