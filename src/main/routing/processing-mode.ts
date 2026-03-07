// src/main/routing/processing-mode.ts
// Processing mode union type used by ModeRouter.
// "default" is the current batch pipeline (capture → STT → optional transform → output).
// "streaming" is the upcoming live session control plane.
// "transform_only" is for standalone transformation shortcuts (clipboard/selection source).

export type ProcessingMode = 'default' | 'streaming' | 'transform_only'
