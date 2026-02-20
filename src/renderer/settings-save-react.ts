/*
Where: src/renderer/settings-save-react.ts
What: React-rendered Settings save action button.
Why: Move save action event ownership from legacy form submit listener to React.
*/

import { createElement, useState } from 'react'

interface SettingsSaveReactProps {
  onSave: () => Promise<void>
}

export const SettingsSaveReact = ({ onSave }: SettingsSaveReactProps) => {
  const [saving, setSaving] = useState(false)

  return createElement(
    'div',
    { className: 'settings-actions' },
    createElement(
      'button',
      {
        type: 'button',
        disabled: saving,
        onClick: () => {
          setSaving(true)
          void onSave()
            .catch(() => {
              // Save callback is responsible for user-facing error feedback.
            })
            .finally(() => {
              setSaving(false)
            })
        }
      },
      'Save Settings'
    )
  )
}
