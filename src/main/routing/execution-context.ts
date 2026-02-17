// src/main/routing/execution-context.ts
// ExecutionContext is the output of ModeRouter.route().
// It carries the routing decision: which mode, which queue lane, and the bound snapshot.
// Downstream stages receive a complete, immutable instruction set.

import type { CaptureRequestSnapshot } from './capture-request-snapshot'
import type { TransformationRequestSnapshot } from './transformation-request-snapshot'

/** Queue lane discriminator — each lane processes independently. */
export type QueueLane = 'capture' | 'transform'

/** Discriminated union: routing decision with the bound snapshot. */
export type ExecutionContext =
  | {
      readonly mode: 'default'
      readonly lane: 'capture'
      readonly snapshot: Readonly<CaptureRequestSnapshot>
    }
  | {
      readonly mode: 'transform_only'
      readonly lane: 'transform'
      readonly snapshot: Readonly<TransformationRequestSnapshot>
    }
