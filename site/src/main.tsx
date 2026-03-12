/*
 * Where: site/src/main.tsx
 * What: React bootstrap for the Dicta landing page.
 * Why: Mount the static-site application into the GitHub Pages HTML shell.
 */

import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

const host = document.getElementById('app')

if (!host) {
  throw new Error('Dicta landing-page host element was not found.')
}

createRoot(host).render(<App />)
