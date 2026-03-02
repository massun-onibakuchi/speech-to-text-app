<!--
Where: docs/decisions/select-component-strategy.md
What: Decision record for replacing native <select> controls with a Radix-based shared primitive.
Why: Native <select><option> cannot reliably theme popup/item colors cross-platform;
     Issue #255 calls for a deliberate decision before migration work begins (#299).
-->

# Decision: Select Component Strategy (Issue #255)

**Date**: 2026-03-02
**Status**: Accepted
**Ticket**: #255 (decision gate), #299 (implementation)
**Supersedes**: none — extends `shadcn-ui-setup.md` (which lists Select in the component set)

## Context

The app currently uses native `<select><option>` elements in two settings components:

| Component | Selects |
|-----------|---------|
| `settings-stt-provider-form-react.tsx` | STT provider, STT model |
| `settings-recording-react.tsx` | Recording method, sample rate, audio device |

All native selects share identical `SELECT_CLS` / `SELECT_MONO_CLS` constants that style the
trigger element. However, native `<select>` popup/item colors are controlled by the OS and cannot
be reliably themed — on macOS the dropdown popup renders in system default colors regardless of
CSS applied to the trigger.

`shadcn-ui-setup.md` already establishes that shadcn/ui Select (which is a Radix UI wrapper) is
in the component set and should be manually copied into `src/renderer/components/ui/`.

## Decision: Option B — Add `@radix-ui/react-select` and migrate

**Chosen option:** Replace all in-scope native `<select>` controls with a shared
`src/renderer/components/ui/select.tsx` primitive that wraps `@radix-ui/react-select`, styled to
app design tokens.

### Why not Option A (keep native)

- Cannot theme popup/item background or text colors on macOS or Windows.
- Inconsistent appearance across OS versions breaks the app's design token system.

### Why not Option C (custom listbox/popover)

- Requires reimplementing ARIA Listbox semantics, keyboard navigation, and focus management.
- Higher engineering cost and accessibility risk than using a battle-tested primitive.

### Why Option B

- Radix provides ARIA Listbox pattern, keyboard navigation (Up/Down, Home/End, type-ahead), and
  focus management out of the box.
- The shared primitive lives in `src/renderer/components/ui/select.tsx`, consistent with the
  manual-copy convention in `shadcn-ui-setup.md`.
- Electron desktop bundle overhead (~15–20 KB gzipped) is negligible.
- License: MIT ✓. No security advisories as of `pnpm audit` pre-migration check.

## Migration Scope

### In scope
- `settings-stt-provider-form-react.tsx`: provider select, model select (2 controls)
- `settings-recording-react.tsx`: recording method, sample rate, audio device selects (3 controls)

### Out of scope
- Profile picker / transformation picker (custom listbox, separate concern)
- Any non-select controls

## E2E Selector Migration Plan

Radix Select replaces `<select id="…">` with a `<button>` trigger + portal `<div>` for the
dropdown content. Native select IDs will no longer map to a `<select>` element.

Strategy:
1. Add `data-testid` attributes to each `SelectTrigger` before removing the native `<select>`.
2. Keep the existing `id` on `SelectTrigger` during transition for backward compatibility.
3. Update `e2e/electron-ui.e2e.ts` selectors to use `data-testid` instead of element-type queries.
4. After E2E tests are migrated, the redundant `id` on triggers can be removed in a follow-up.

Affected E2E selector IDs to migrate:
- `#settings-transcription-provider`
- `#settings-transcription-model`
- `#settings-recording-method`
- `#settings-recording-device`

## Shared Primitive Location

```
src/renderer/
  components/
    ui/
      select.tsx    ← new (issue #299)
```

Implementation follows the `new-york` style variant from `shadcn-ui-setup.md` with
`React.forwardRef` + `React.ComponentPropsWithoutRef` typing (required for TypeScript strictness).

## Consequences

- **Positive**: Popup and item colors respect app OKLCH design tokens on all platforms.
- **Positive**: Consistent keyboard navigation and accessibility across all select controls.
- **Positive**: Removes duplicate `SELECT_CLS`/`SELECT_MONO_CLS` constants.
- **Negative**: Radix portal appends to `document.body` — must verify z-index / viewport behavior
  in Electron before shipping (especially for triggers near the bottom of a 760px window).
- **E2E impact**: Selectors must migrate from native `<select>` queries to `data-testid` before
  DOM structure changes land. See migration plan above.

## References

- Issue #255: https://github.com/massun-onibakuchi/speech-to-text-app/issues/255
- Issue #299 (implementation): https://github.com/massun-onibakuchi/speech-to-text-app/issues/299
- `docs/decisions/shadcn-ui-setup.md` — manual-copy convention and component path
- Radix UI Select: https://www.radix-ui.com/primitives/docs/components/select
