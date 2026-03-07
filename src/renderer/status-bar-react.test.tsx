/*
 * Where: src/renderer/status-bar-react.test.tsx
 * What: Component tests for STY-07 status bar metadata and connectivity pairing.
 * Why: Ensure footer keeps icon+text status semantics and compact metadata rendering.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { StatusBarReact } from './status-bar-react'

const idleStreamingSession = {
  sessionId: null,
  state: 'idle' as const,
  provider: null,
  transport: null,
  model: null,
  reason: null
}

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

describe('StatusBarReact', () => {
  it('renders metadata cluster and ready connectivity when ping is pong', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<StatusBarReact settings={DEFAULT_SETTINGS} ping="pong" streamingSessionState={idleStreamingSession} />)
    await flush()

    expect(host.textContent).toContain('groq/whisper-large-v3-turbo')
    expect(host.textContent).toContain('google')
    expect(host.textContent).toContain('system_default')
    expect(host.querySelector('[data-status-active-profile]')?.textContent).toContain('Default')
    expect(host.querySelector('[data-status-connectivity]')?.textContent).toContain('Ready')
  })

  it('renders offline connectivity label when ping is not pong', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<StatusBarReact settings={DEFAULT_SETTINGS} ping="nope" streamingSessionState={idleStreamingSession} />)
    await flush()

    expect(host.querySelector('[data-status-connectivity]')?.textContent).toContain('Offline')
  })

  it('shows live streaming session state when processing.mode=streaming', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.processing.mode = 'streaming'
    settings.processing.streaming.enabled = true
    settings.processing.streaming.provider = 'local_whispercpp_coreml'
    settings.processing.streaming.transport = 'native_stream'
    settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    settings.processing.streaming.outputMode = 'stream_raw_dictation'

    root.render(
      <StatusBarReact
        settings={settings}
        ping="pong"
        streamingSessionState={{
          sessionId: 'session-1',
          state: 'active',
          provider: 'local_whispercpp_coreml',
          transport: 'native_stream',
          model: 'ggml-large-v3-turbo-q5_0',
          reason: null
        }}
      />
    )
    await flush()

    expect(host.textContent).toContain('local_whispercpp_coreml/ggml-large-v3-turbo-q5_0')
    expect(host.querySelector('[data-status-streaming-session]')?.textContent).toContain('stream:active')
  })
})
