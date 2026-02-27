<!--
Where: docs/decisions/shadcn-ui-setup.md
What: Decision record for shadcn/ui setup approach.
Why: The CLI generator requires a Next.js/Remix context; manual copy is safe for Electron.
-->

# Decision: shadcn/ui Setup Approach

**Date**: 2026-02-27
**Status**: Accepted
**Ticket**: STY-00

## Context

The style spec (`docs/style-update.md`) references shadcn/ui (`style: "new-york"`, `cssVariables: true`) as the component library. The project is an **Electron + electron-vite** app, not a Next.js or Remix project. The `npx shadcn@latest init` CLI expects a specific framework context (Next.js router, app directory conventions) that doesn't apply here.

## Decision: Manual Component Copy

- **Approach**: Copy shadcn/ui component source files directly into `src/renderer/components/ui/` as needed per-ticket, following the `new-york` style variant with `cssVariables: true`.
- **No CLI generator**: Do not run `npx shadcn@latest init` or `npx shadcn@latest add`. Source files are stable and well-known; copy-on-demand avoids framework coupling.
- **Component set**: Copy only components actually required by each ticket (Button, Input, Textarea, Select, Switch, Separator, Badge, Tabs, ScrollArea).
- **cn() helper**: Located at `src/renderer/lib/utils.ts`, aliased as `@/lib/utils` in both Vite and tsconfig.

## Rationale

| Option | Pros | Cons |
|---|---|---|
| CLI generator | Automated | Requires Next.js context, scaffolds unwanted files |
| Manual copy | Simple, framework-agnostic, full control | Manual updates to upstream changes |

Manual copy is the correct approach for an Electron desktop app with a well-defined, stable design system target.

## Path Convention

```
src/renderer/
  components/
    ui/
      button.tsx        # shadcn/ui Button (new-york)
      input.tsx         # shadcn/ui Input
      badge.tsx         # shadcn/ui Badge
      ...               # others added per-ticket
  lib/
    utils.ts            # cn() helper
```

## References

- shadcn/ui source: https://ui.shadcn.com/docs/components
- Style variant: new-york
- CSS variables: enabled
