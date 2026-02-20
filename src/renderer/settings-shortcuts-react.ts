/*
Where: src/renderer/settings-shortcuts-react.ts
What: React-rendered Settings shortcut contract panel.
Why: Continue renderer migration by moving Settings UI slices from legacy string templates to React components.
*/

import { createElement } from 'react'

export interface ShortcutBinding {
  action: string
  combo: string
}

interface SettingsShortcutsReactProps {
  shortcuts: ShortcutBinding[]
}

export const SettingsShortcutsReact = ({ shortcuts }: SettingsShortcutsReactProps) =>
  createElement(
    'article',
    { className: 'card shortcuts', 'data-stagger': '', style: { '--delay': '400ms' } as any },
    createElement('h2', null, 'Shortcut Contract'),
    createElement('p', { className: 'muted' }, 'Reference from v1 spec for default operator bindings.'),
    createElement(
      'ul',
      { className: 'shortcut-list' },
      ...shortcuts.map((shortcut) =>
        createElement(
          'li',
          { key: shortcut.action, className: 'shortcut-item' },
          createElement('span', { className: 'shortcut-action' }, shortcut.action),
          createElement('kbd', { className: 'shortcut-combo' }, shortcut.combo)
        )
      )
    )
  )
