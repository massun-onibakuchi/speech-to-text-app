/*
Where: src/renderer/settings-save-react.tsx
What: React-rendered Settings save action button.
Why: Move save action event ownership from legacy form submit listener to React.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useState } from 'react'

interface SettingsSaveReactProps {
  saveMessage: string
  onSave: () => Promise<void>
}

export const SettingsSaveReact = ({ saveMessage, onSave }: SettingsSaveReactProps) => {
  const [saving, setSaving] = useState(false)

  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        type="button"
        className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        disabled={saving}
        onClick={() => {
          setSaving(true)
          void onSave()
            .catch(() => {
              // Save callback is responsible for user-facing error feedback.
            })
            .finally(() => {
              setSaving(false)
            })
        }}
      >
        Save Settings
      </button>
      <p id="settings-save-message" className="text-xs text-muted-foreground" aria-live="polite">
        {saveMessage}
      </p>
    </div>
  )
}
