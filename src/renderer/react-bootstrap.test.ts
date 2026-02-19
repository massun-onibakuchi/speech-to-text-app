/*
Where: src/renderer/react-bootstrap.test.ts
What: Smoke tests for React renderer bootstrap mount behavior.
Why: Ensure React bootstrap mounts safely and delegates ownership to the legacy renderer entrypoint.
*/

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountRendererShell } from './react-bootstrap'

const waitForLegacyBootstrap = async (spy: ReturnType<typeof vi.fn>): Promise<void> => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (spy.mock.calls.length > 0) {
      return
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('react bootstrap', () => {
  it('mounts a React host and delegates to legacy renderer', async () => {
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    const startLegacyRenderer = vi.fn()

    const mounted = mountRendererShell({
      mountPoint,
      startLegacyRenderer
    })

    await waitForLegacyBootstrap(startLegacyRenderer)
    const legacyHost = mountPoint.querySelector<HTMLDivElement>('#legacy-renderer-root')
    expect(legacyHost).not.toBeNull()
    expect(startLegacyRenderer).toHaveBeenCalledTimes(1)
    expect(startLegacyRenderer).toHaveBeenCalledWith(legacyHost)
    mounted.unmount()
  })
})
