/*
Where: src/renderer/main.ts
What: Renderer entrypoint that mounts the React-owned app.
Why: Remove the legacy bootstrap host path and keep a single direct mount.
*/

import './styles.css'
import { startRendererApp } from './renderer-app'
import { startScratchSpaceApp } from './scratch-space-app'

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (mountPoint) {
  const windowType = new URLSearchParams(window.location.search).get('window')
  if (windowType === 'scratch-space') {
    startScratchSpaceApp(mountPoint)
  } else {
    startRendererApp(mountPoint)
  }
}
