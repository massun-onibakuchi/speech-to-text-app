/*
Where: src/renderer/main.ts
What: Renderer entrypoint that mounts the React-owned app.
Why: Remove the legacy bootstrap host path and keep a single direct mount.
*/

import './styles.css'
import { startRendererApp } from './renderer-app'
import { startVadMicDebugHarness } from './vad-mic-debug-harness'

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (mountPoint) {
  if (import.meta.env.VITE_RENDERER_VIEW === 'vad-mic-harness') {
    startVadMicDebugHarness(mountPoint)
  } else {
    startRendererApp(mountPoint)
  }
}
