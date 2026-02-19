/*
Where: src/renderer/main.ts
What: Renderer entrypoint that selects React or vanilla mount path.
Why: Keep a rollback-safe gate while bootstrapping React root with zero behavior change.
*/

import './styles.css'
import { startLegacyRenderer } from './legacy-renderer'
import { mountRendererShell, resolveRendererMode } from './react-bootstrap'

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (mountPoint) {
  const mode = resolveRendererMode(import.meta.env.VITE_RENDERER_MODE)
  mountRendererShell({
    mountPoint,
    mode,
    startLegacyRenderer
  })
}
