// Where: scripts/dev-vad-mic-harness.mjs
// What:  Launches the Electron app with the renderer switched to the live mic VAD harness.
// Why:   Keep the manual VAD repro flow one command away and cross-platform inside Node.

import { spawn } from 'node:child_process'

console.log('Starting Electron in vad-mic-harness renderer mode.')
console.log('Use Start listening, speak into the mic, then Stop with flush or Cancel without flush.')

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'electron-vite', 'dev'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_RENDERER_VIEW: 'vad-mic-harness'
    }
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
