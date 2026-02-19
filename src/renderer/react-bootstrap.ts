/*
Where: src/renderer/react-bootstrap.ts
What: React mount layer that hosts the renderer root.
Why: Keep renderer boot path React-native while delegating existing behavior wiring to legacy renderer module.
*/

import { createElement, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export interface LegacyRendererStarter {
  (target?: HTMLDivElement): void
}

export interface MountRendererShellOptions {
  mountPoint: HTMLDivElement
  startLegacyRenderer: LegacyRendererStarter
}

export interface MountedRendererShell {
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

export const mountRendererShell = (options: MountRendererShellOptions): MountedRendererShell => {
  const { mountPoint, startLegacyRenderer } = options

  const root: Root = createRoot(mountPoint)
  root.render(
    createElement(LegacyRendererHost, {
      startLegacyRenderer
    })
  )

  return {
    unmount: () => {
      root.unmount()
    }
  }
}
