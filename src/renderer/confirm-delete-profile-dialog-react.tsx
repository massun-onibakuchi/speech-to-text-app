/*
Where: src/renderer/confirm-delete-profile-dialog-react.tsx
What: Reusable delete-confirmation dialog for destructive profile removal actions.
Why: Issue #367 requires explicit confirmation before deleting a profile.
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

interface ConfirmDeleteProfileDialogReactProps {
  open: boolean
  profileName: string
  pending: boolean
  onConfirm: () => Promise<boolean>
  onOpenChange: (open: boolean) => void
}

export const ConfirmDeleteProfileDialogReact = ({
  open,
  profileName,
  pending,
  onConfirm,
  onOpenChange
}: ConfirmDeleteProfileDialogReactProps) => {
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
          <DialogTitle>Delete profile?</DialogTitle>
          <DialogDescription>
            This deletes the profile "{profileName}" from this app.
          </DialogDescription>
          <p className="text-[11px] text-muted-foreground">
            This action cannot be undone.
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
            {pending ? 'Deleting...' : 'Delete'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
