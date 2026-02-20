/*
Where: src/renderer/main.ts
What: Renderer entrypoint that mounts the React shell host.
Why: Keep a single renderer boot path while migration continues inside React-managed mounts.
*/

import './styles.css'
import { startLegacyRenderer } from './legacy-renderer'
import { mountRendererShell } from './react-bootstrap'

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (mountPoint) {
  mountRendererShell({
    mountPoint,
    startLegacyRenderer
  })
}
