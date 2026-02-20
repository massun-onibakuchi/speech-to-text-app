/*
Where: src/renderer/legacy-renderer.ts
What: Final inventory for legacy renderer ownership after React shell cutover.
Why: Keep an explicit migration checkpoint while preserving a stable import surface.

Legacy ownership inventory (2026-02-20):
- Shell/template rendering: none.
- Home/Settings UI event ownership: none.
- Remaining legacy path: this compatibility export only.
*/

import { startRendererApp } from './renderer-app'

export const startLegacyRenderer = (target?: HTMLDivElement): void => {
  startRendererApp(target)
}
