// src/main/routing/mode-router.ts
// Routes incoming commands to the appropriate ExecutionContext.
// Reads current processing mode via ProcessingModeSource and constructs
// the correct ExecutionContext with a frozen snapshot.
// Not yet wired to production path; integrated in Phase 2A.

import type { ProcessingModeSource } from './processing-mode-source'
import type { ExecutionContext } from './execution-context'
import type { CaptureRequestSnapshot } from './capture-request-snapshot'
import type { TransformationRequestSnapshot } from './transformation-request-snapshot'

interface ModeRouterDependencies {
  modeSource: ProcessingModeSource
}

export class ModeRouter {
  private readonly modeSource: ProcessingModeSource

  constructor(dependencies: ModeRouterDependencies) {
    this.modeSource = dependencies.modeSource
  }

  /** Route a finalized capture to the appropriate execution context. */
  routeCapture(snapshot: Readonly<CaptureRequestSnapshot>): ExecutionContext {
    const mode = this.modeSource.resolve()
    if (mode !== 'default') {
      throw new Error(`Unsupported processing mode for capture: ${mode}`)
    }
    return {
      mode: 'default',
      lane: 'capture',
      snapshot
    }
  }

  /** Route a standalone transformation shortcut to the appropriate execution context. */
  routeTransformation(snapshot: Readonly<TransformationRequestSnapshot>): ExecutionContext {
    return {
      mode: 'transform_only',
      lane: 'transform',
      snapshot
    }
  }
}
