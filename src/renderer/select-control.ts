/*
Where: src/renderer/select-control.ts
What: Shared select-like control class tokens for renderer form surfaces.
Why: Enforce one canonical select styling path across Audio Input, Profiles, and Settings tabs.
*/

const SELECT_CONTROL_BASE =
  'rounded border border-input bg-input px-2 text-xs text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export const SELECT_CONTROL_CLASS = `h-8 ${SELECT_CONTROL_BASE}`
export const SELECT_CONTROL_MONO_CLASS = `${SELECT_CONTROL_CLASS} font-mono`
