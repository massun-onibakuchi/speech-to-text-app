/*
Where: src/renderer/react-bootstrap.test.ts
What: Smoke tests for React renderer bootstrap mount behavior.
Why: Ensure React kickoff path mounts safely and delegates ownership to legacy renderer.
*/

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountRendererShell, resolveRendererMode } from './react-bootstrap'

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
  it('mounts a React host and delegates to legacy renderer in react mode', async () => {
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    const startLegacyRenderer = vi.fn()

    const mounted = mountRendererShell({
      mountPoint,
      mode: 'react',
      startLegacyRenderer
    })

    await waitForLegacyBootstrap(startLegacyRenderer)
    const legacyHost = mountPoint.querySelector<HTMLDivElement>('#legacy-renderer-root')
    expect(legacyHost).not.toBeNull()
    expect(startLegacyRenderer).toHaveBeenCalledTimes(1)
    expect(startLegacyRenderer).toHaveBeenCalledWith(legacyHost)
    mounted.unmount()
  })

  it('uses vanilla mode as rollback path without creating a React host', () => {
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    const startLegacyRenderer = vi.fn()

    const mounted = mountRendererShell({
      mountPoint,
      mode: 'vanilla',
      startLegacyRenderer
    })

    expect(startLegacyRenderer).toHaveBeenCalledTimes(1)
    expect(startLegacyRenderer).toHaveBeenCalledWith(mountPoint)
    expect(mountPoint.querySelector('#legacy-renderer-root')).toBeNull()
    mounted.unmount()
  })

  it('defaults unknown mode values to react path', () => {
    expect(resolveRendererMode(undefined)).toBe('react')
    expect(resolveRendererMode('react')).toBe('react')
    expect(resolveRendererMode('vanilla')).toBe('vanilla')
    expect(resolveRendererMode('unexpected')).toBe('react')
  })
})
