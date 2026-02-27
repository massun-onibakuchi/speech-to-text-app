/*
Where: src/renderer/settings-shortcuts-react.tsx
What: React-rendered Settings shortcut contract panel.
Why: Continue renderer migration by moving Settings UI slices from legacy string templates to React components.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { Kbd } from './kbd'
import { cn } from './lib/utils'

export interface ShortcutBinding {
  action: string
  combo: string
}

interface SettingsShortcutsReactProps {
  shortcuts: ShortcutBinding[]
}

export const SettingsShortcutsReact = ({ shortcuts }: SettingsShortcutsReactProps) => (
  <article className="mt-3 rounded-lg border border-border bg-card p-3">
    <h2 className="text-sm font-semibold text-foreground m-0">Shortcut Contract</h2>
    <p className="mt-1 text-[11px] text-muted-foreground">Reference from v1 spec for default operator bindings.</p>
    <ul className="mt-3 space-y-2">
      {shortcuts.map((shortcut) => (
        <li key={shortcut.action} className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground">{shortcut.action}</span>
          <span className="flex flex-wrap items-center justify-end gap-1" data-shortcut-combo>
            {shortcut.combo.split('+').map((segment, index) => (
              <span key={`${shortcut.action}-${segment}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
                <Kbd className={cn('h-5')}>{segment}</Kbd>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  </article>
)
