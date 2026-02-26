/*
Where: src/renderer/shell-chrome-react.tsx
What: React-rendered shell chrome (hero + top navigation).
Why: Reduce legacy template rendering and keep navigation click ownership in React.
     Migrated from .ts (createElement) to .tsx (JSX) as the proof-of-concept for the
     project-wide TSX migration (see docs/decisions/tsx-migration.md).
*/

import type { CSSProperties } from 'react'
import type { Settings } from '../shared/domain'

type AppPage = 'home' | 'settings'

interface ShellChromeReactProps {
  ping: string
  settings: Settings
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

export const ShellChromeReact = ({ settings, currentPage, onNavigate }: ShellChromeReactProps) => (
  <>
    <section className="hero card" data-stagger="" style={{ '--delay': '40ms' } as CSSProperties}>
      <p className="eyebrow">Speech-to-Text Control Room</p>
      <h1>Speech-to-Text v1</h1>
      <div className="hero-meta">
        <span className="chip">STT {settings.transcription.provider} / {settings.transcription.model}</span>
        <span className="chip">Transform Auto-run {settings.transformation.autoRunDefaultTransform ? 'On' : 'Off'}</span>
      </div>
    </section>
    <nav className="top-nav card" aria-label="Primary">
      <button
        type="button"
        className={`nav-tab${currentPage === 'home' ? ' is-active' : ''}`}
        data-route-tab="home"
        aria-pressed={currentPage === 'home' ? 'true' : 'false'}
        onClick={() => { onNavigate('home') }}
      >
        Home
      </button>
      <button
        type="button"
        className={`nav-tab${currentPage === 'settings' ? ' is-active' : ''}`}
        data-route-tab="settings"
        aria-pressed={currentPage === 'settings' ? 'true' : 'false'}
        onClick={() => { onNavigate('settings') }}
      >
        Settings
      </button>
    </nav>
  </>
)
