/*
Where: src/renderer/react-bootstrap.ts
What: React mount layer that hosts legacy renderer during migration.
Why: Provide React root bootstrap with explicit rollback gate and single event owner.
*/

import { createElement, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export type RendererMode = 'react' | 'vanilla'

export interface LegacyRendererStarter {
  (target?: HTMLDivElement): void
}

export interface MountRendererShellOptions {
  mountPoint: HTMLDivElement
  mode: RendererMode
  startLegacyRenderer: LegacyRendererStarter
}

export interface MountedRendererShell {
  mode: RendererMode
  unmount: () => void
}

const LegacyRendererHost = ({ startLegacyRenderer }: { startLegacyRenderer: LegacyRendererStarter }) => {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (hostRef.current) {
      startLegacyRenderer(hostRef.current)
    }
  }, [startLegacyRenderer])

  return createElement('div', {
    id: 'legacy-renderer-root',
    'data-renderer-owner': 'legacy',
    ref: hostRef
  })
}

export const resolveRendererMode = (value: string | undefined): RendererMode => {
  return value === 'vanilla' ? 'vanilla' : 'react'
}

export const mountRendererShell = (options: MountRendererShellOptions): MountedRendererShell => {
  const { mountPoint, mode, startLegacyRenderer } = options

  if (mode === 'vanilla') {
    startLegacyRenderer(mountPoint)
    return {
      mode,
      unmount: () => {}
    }
  }

  const root: Root = createRoot(mountPoint)
  root.render(
    createElement(LegacyRendererHost, {
      startLegacyRenderer
    })
  )

  return {
    mode,
    unmount: () => {
      root.unmount()
    }
  }
}
