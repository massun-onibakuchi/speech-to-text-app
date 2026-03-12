/*
 * Where: site/vite.config.ts
 * What: Vite configuration for the Dicta GitHub Pages landing page.
 * Why: Keep the static site build isolated from Electron while honoring the repository project-site base path.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PROJECT_SITE_BASE = '/speech-to-text-app/'

export default defineConfig({
  root: __dirname,
  base: PROJECT_SITE_BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
