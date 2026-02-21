/*
Where: src/renderer/settings-shortcuts-react.tsx
What: React-rendered Settings shortcut contract panel.
Why: Continue renderer migration by moving Settings UI slices from legacy string templates to React components.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

export interface ShortcutBinding {
  action: string
  combo: string
}

interface SettingsShortcutsReactProps {
  shortcuts: ShortcutBinding[]
}

export const SettingsShortcutsReact = ({ shortcuts }: SettingsShortcutsReactProps) => (
  <article className="card shortcuts" data-stagger="" style={{ '--delay': '400ms' } as any}>
    <h2>Shortcut Contract</h2>
    <p className="muted">Reference from v1 spec for default operator bindings.</p>
    <ul className="shortcut-list">
      {shortcuts.map((shortcut) => (
        <li key={shortcut.action} className="shortcut-item">
          <span className="shortcut-action">{shortcut.action}</span>
          <kbd className="shortcut-combo">{shortcut.combo}</kbd>
        </li>
      ))}
    </ul>
  </article>
)
