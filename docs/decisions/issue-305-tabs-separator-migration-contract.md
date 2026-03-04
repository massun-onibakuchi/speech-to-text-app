# Decision: Issue #305 Tabs + Separator Migration Contract

- **Date:** 2026-03-04
- **Status:** Accepted
- **Related Issue:** #305 (PR3 scope)

## Context

`app-shell-react.tsx` used a custom `TabButton` and native `<hr>` elements. The migration requires Radix `Tabs` and `Separator` without changing the current top horizontal rail behavior or panel persistence.

## Decision

1. Replace custom tab buttons with `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` wrappers.
2. Keep the current top horizontal rail visual style via explicit trigger classes (flat underline style).
3. Keep all tab panels mounted using `forceMount`, then hide inactive panels with `hidden` class to preserve existing panel state/DOM behavior.
4. Replace native `<hr>` with `Separator`.

## Why

- Maintains current UX and test assumptions while moving to standardized primitives.
- Preserves mounted panel behavior to avoid remount side effects in settings forms.

## Consequences

### Positive
- Accessible tab semantics via Radix roles/attributes.
- Consistent primitive usage across the app.

### Trade-off
- Slightly more explicit class wiring on each `TabsTrigger` to preserve existing visual style.
