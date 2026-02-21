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
    <div className="settings-actions">
      <button
        type="button"
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
      <p id="settings-save-message" className="muted" aria-live="polite">
        {saveMessage}
      </p>
    </div>
  )
}
