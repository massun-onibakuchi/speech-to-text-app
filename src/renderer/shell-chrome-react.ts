/*
Where: src/renderer/shell-chrome-react.ts
What: React-rendered shell chrome (hero + top navigation).
Why: Reduce legacy template rendering and keep navigation click ownership in React.
*/

import { createElement, Fragment } from 'react'
import type { Settings } from '../shared/domain'

type AppPage = 'home' | 'settings'

interface ShellChromeReactProps {
  ping: string
  settings: Settings
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

export const ShellChromeReact = ({ ping, settings, currentPage, onNavigate }: ShellChromeReactProps) =>
  createElement(
    Fragment,
    null,
    createElement(
      'section',
      { className: 'hero card', 'data-stagger': '', style: { '--delay': '40ms' } as any },
      createElement('p', { className: 'eyebrow' }, 'Speech-to-Text Control Room'),
      createElement('h1', null, 'Speech-to-Text v1'),
      createElement(
        'div',
        { className: 'hero-meta' },
        createElement('span', { className: 'chip chip-good' }, `IPC ${ping}`),
        createElement('span', { className: 'chip' }, `STT ${settings.transcription.provider} / ${settings.transcription.model}`),
        createElement('span', { className: 'chip' }, `Transform ${settings.transformation.enabled ? 'Enabled' : 'Disabled'}`)
      )
    ),
    createElement(
      'nav',
      { className: 'top-nav card', 'aria-label': 'Primary' },
      createElement(
        'button',
        {
          type: 'button',
          className: `nav-tab${currentPage === 'home' ? ' is-active' : ''}`,
          'data-route-tab': 'home',
          'aria-pressed': currentPage === 'home' ? 'true' : 'false',
          onClick: () => {
            onNavigate('home')
          }
        },
        'Home'
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: `nav-tab${currentPage === 'settings' ? ' is-active' : ''}`,
          'data-route-tab': 'settings',
          'aria-pressed': currentPage === 'settings' ? 'true' : 'false',
          onClick: () => {
            onNavigate('settings')
          }
        },
        'Settings'
      )
    )
  )
