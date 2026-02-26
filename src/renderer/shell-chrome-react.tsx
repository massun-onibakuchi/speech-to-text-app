/*
Where: src/renderer/shell-chrome-react.tsx
What: Compact unified app header — brand, status chips, and navigation tabs in one bar.
Why: Replaces the original two-card layout (hero card + nav card) with a single horizontal
     header. This reduces vertical space, improves visual hierarchy, and puts navigation
     inline with the brand — a more conventional, scannable app chrome pattern.
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

export const ShellChromeReact = ({ settings, currentPage, onNavigate }: ShellChromeReactProps) => {
  const autoRunLabel = settings.transformation.autoRunDefaultTransform ? 'Auto-run On' : 'Auto-run Off'
  const autoRunActive = settings.transformation.autoRunDefaultTransform

  return (
    <header
      className="app-header"
      data-stagger=""
      style={{ '--delay': '40ms' } as CSSProperties}
    >
      {/* Brand */}
      <div className="app-header-brand">
        <h1 className="app-header-title">Speech-to-Text</h1>
        <span className="app-header-version">v1</span>
      </div>

      {/* Status chips — hidden on small screens via CSS */}
      <div className="app-header-meta">
        <span className="chip">
          {settings.transcription.provider} / {settings.transcription.model}
        </span>
        <span className={`chip${autoRunActive ? ' chip-good' : ''}`}>
          {autoRunLabel}
        </span>
      </div>

      {/* Page navigation */}
      <nav className="app-header-nav" aria-label="Primary">
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
    </header>
  )
}
