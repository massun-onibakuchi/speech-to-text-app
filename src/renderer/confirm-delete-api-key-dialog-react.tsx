/*
Where: src/renderer/confirm-delete-api-key-dialog-react.tsx
What: Reusable delete-confirmation dialog for API key destructive actions.
Why: Issue #335 requires explicit confirmation before API key deletion.
*/

import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog'

interface ConfirmDeleteApiKeyDialogReactProps {
  open: boolean
  providerLabel: string
  pending: boolean
  onConfirm: () => Promise<boolean>
  onOpenChange: (open: boolean) => void
}

export const ConfirmDeleteApiKeyDialogReact = ({
  open,
  providerLabel,
  pending,
  onConfirm,
  onOpenChange
}: ConfirmDeleteApiKeyDialogReactProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) {
          return
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        role="alertdialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete API key?</DialogTitle>
          <DialogDescription>
            This deletes the saved {providerLabel} API key from this app.
          </DialogDescription>
          <p className="text-[11px] text-muted-foreground">
            Recording and transformations that require this key will be blocked until you save a new key.
          </p>
        </DialogHeader>

        <DialogFooter>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            className="h-8 rounded border border-border bg-secondary px-3 text-xs text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            className="h-8 rounded bg-destructive px-3 text-xs text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50"
            onClick={() => {
              void onConfirm()
            }}
          >
            {pending ? 'Deleting...' : 'Delete key'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
