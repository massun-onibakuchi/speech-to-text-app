# Decision: Issue #363 + #364 Tray Behavior and Settings Sync

- Date: 2026-03-05
- Status: Accepted
- Scope: macOS menu bar tray behavior and renderer settings coherence after main-process hotkey-driven setting mutations.

## Context

Issue #363 and #364 require two complementary guarantees:

1. Tray menu behavior should match expected macOS menu bar interaction:
- the app must provide a meaningful tray icon,
- the context menu should emphasize the high-value action (`Settings`) and explicit exit (`Quit`).

2. Renderer Settings UI must stay coherent when settings are mutated in the main process (for example hotkey-driven profile operations), without requiring manual refresh.

## Decision

### A. Tray icon loading and menu structure

- Introduce a canonical tray icon path resolver (`src/main/infrastructure/tray-icon-path.ts`) to handle dev vs packaged paths.
- Load tray icon from `resources/tray/speech_to_text@2x.png` using `nativeImage.createFromPath`.
- Mark non-empty image as template (`setTemplateImage(true)`) to align with macOS menu bar rendering behavior.
- Keep resilience fallback to `nativeImage.createEmpty()` if icon load fails.
- Simplify tray context menu to:
  - `Settings`
  - separator
  - `Quit`

### B. Open Settings routing from tray

- Selecting `Settings` opens/focuses main window and sends renderer event `IPC_CHANNELS.onOpenSettings`.
- If web contents are still loading, defer dispatch until `did-finish-load`.

### C. Cross-process settings update synchronization

- Keep `settings:on-updated` channel in IPC contract.
- Main process broadcasts when hotkey service mutates settings (`lastPickedPresetId`, `defaultPresetId`).
- Renderer listens and refetches authoritative settings (`getSettings`) while invalidating stale pending autosave state.

## Alternatives considered

### 1. Keep empty tray icon

- Pros: no new asset handling.
- Cons: poor discoverability/consistency for macOS menu bar apps; fragile UX.
- Rejected.

### 2. Emit `open-settings` immediately without load guard

- Pros: simpler implementation.
- Cons: event can be lost if renderer not ready.
- Rejected.

### 3. Optimistically mutate renderer state without round-trip `getSettings`

- Pros: fewer IPC calls.
- Cons: risks divergence from main-process source of truth.
- Rejected.

## Trade-offs

- Adds one new small resource asset and one new infrastructure resolver file.
- Slightly more main/renderer wiring complexity, in exchange for deterministic synchronization and robust tray behavior.

## Verification

- `src/main/core/window-manager.test.ts` validates icon load/fallback, menu items, and open-settings event timing.
- `src/main/services/hotkey-service.test.ts` validates settings-updated callback calls on mutating flows.
- `src/renderer/renderer-app.test.ts` validates renderer refresh behavior on settings-updated and settings navigation event.
