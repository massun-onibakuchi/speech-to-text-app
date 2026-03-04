# Decision: Issue #305 Radix Foundation Strategy

- **Date:** 2026-03-04
- **Status:** Accepted
- **Related Issue:** #305

## Context

Issue #305 requires migration from native controls to Radix primitives while preserving the current OKLCH design system and the existing wrapper pattern established by `src/renderer/components/ui/select.tsx`.

## Decision

1. Add Radix dependencies required by the migration foundation phase:
- `@radix-ui/react-checkbox`
- `@radix-ui/react-radio-group`
- `@radix-ui/react-switch`
- `@radix-ui/react-label`
- `@radix-ui/react-separator`
- `@radix-ui/react-tabs`

2. Implement wrapper components in `src/renderer/components/ui/` instead of consuming Radix primitives directly in feature files.

3. Enforce wrapper conventions used by `select.tsx`:
- `React.forwardRef`
- `data-slot` markers for stable test selectors
- `cn()` for class composition
- `displayName` assignment
- Token-driven classes aligned with current design system

4. Add a dedicated smoke test (`radix-foundation-smoke.test.tsx`) as a foundation gate before consumer migrations (T4-T6).

## Why

- Keeps migration diffs localized and reversible.
- Preserves consistent styling and a11y behavior across controls.
- Reduces risk by validating wrapper exports/rendering before wiring feature behavior.

## Consequences

### Positive
- Standardized primitive layer for future UI work.
- Better test stability via `data-slot` selectors.
- Lower risk in follow-up migrations.

### Negative
- Adds six dependencies and maintenance surface.
- Temporarily introduces wrappers before all consumers are migrated.
