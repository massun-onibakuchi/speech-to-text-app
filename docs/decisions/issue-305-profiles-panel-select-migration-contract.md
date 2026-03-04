# Decision: Issue #305 Profiles Panel Select Migration Contract

- **Date:** 2026-03-04
- **Status:** Accepted
- **Related Issue:** #305 (PR4 scope)

## Context

`profiles-panel-react.tsx` still used two native `<select>` controls (provider/model) in the inline preset editor, while the rest of settings had moved to the shared Radix `Select` wrapper.

## Decision

1. Replace both native selects with shared `Select` primitives (`SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`).
2. Keep provider select disabled and fixed to `google`.
3. Keep model updates wired through `onValueChange` into the existing `onChangeDraft` flow.
4. Keep tests on real Radix behavior and add jsdom-safe DOM API polyfills for pointer-capture and `scrollIntoView`.

## Why

- Removes the last remaining native select usage from profiles editing.
- Preserves existing business behavior (same model allowlist, same save/cancel draft lifecycle).
- Avoids introducing a separate test shim just for this file unless CI instability requires it.

## Consequences

### Positive
- Consistent select UX and styling across settings screens.
- Stronger regression coverage for Radix portal/listbox behavior in this panel.

### Trade-off
- Test file has a small jsdom compatibility shim for missing browser APIs.
