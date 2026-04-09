---
title: Use an activating scratch-space window with a scratch-local preset menu
description: Switch scratch space on macOS from a non-activating panel to an activating typing surface and move its preset menu into the scratch renderer.
date: 2026-04-09
status: superseded
tags:
  - architecture
  - scratch-space
  - renderer
  - electron
  - focus
---

# Context

Superseded by `docs/adr/0015-scratch-space-local-action-menu.md`.

Scratch space currently mixes two different interaction models:

- the scratch window opens as a macOS non-activating panel
- the profile chooser behind the reported `Cmd+K` flow is the global native picker used by `pickTransformation`

That split causes the exact user-facing failures from the research doc:

- the textarea is not ready for immediate typing on open
- the preset menu behaves differently depending on whether scratch was clicked first
- `Escape` ownership is split between the scratch renderer and a separate popup path
- the menu is visually disconnected from the scratch surface it is supposed to serve

The original non-activating design was chosen so opening scratch would not make Dicta frontmost. That behavior no longer matches the product need for “open scratch and type immediately.”

## Decision

Scratch space should be treated as an activating typing surface, not as a background utility panel.

Specific decision points:

- on macOS, opening scratch space should show and focus the scratch window immediately
- textarea focus should be handled as part of the scratch window activation path
- the scratch preset chooser should live inside the scratch renderer tree rather than reusing the global native profile picker
- when the scratch window is visible, the `pickTransformation` shortcut should open the scratch-local preset menu instead of launching the global picker flow
- when scratch is not visible, `pickTransformation` should continue using the existing native picker and pick-and-run behavior
- `Escape` inside scratch should be owned by scratch-local UI state:
  - close the preset menu first
  - close scratch second
- scratch execution should continue to capture the pre-scratch target app and restore focus there for paste

## Why this decision

This is the smallest coherent design that satisfies the product requirement without keeping contradictory focus rules.

It improves correctness:

- the textarea can be reliably focused because the window is actually activated
- the preset menu no longer depends on frontmost-app capture/restore from the global picker flow
- `Escape` semantics can be implemented in one place

It improves UX consistency:

- the scratch shortcut now means “open a typing surface”
- the preset menu behaves as part of scratch instead of as a separate floating tool
- visual layering and focus return are both local to one surface

It keeps scope controlled:

- the global native picker still serves `pickTransformation` and `changeTransformationDefault` outside scratch
- only the scratch-specific preset chooser moves into the renderer

## Consequences

Positive:

- scratch is immediately ready for typing
- the scratch-local preset menu can open without requiring a prior click
- `Escape` precedence is straightforward and testable
- the menu can use an opaque local backdrop for readability

Negative:

- opening scratch on macOS now makes Dicta frontmost
- the previous non-activating scratch contract is removed
- scratch-specific shortcut routing becomes slightly more complex because global `pickTransformation` must branch when scratch is visible

## Options considered

## Option 1: keep scratch non-activating and try to patch focus around it

Rejected.

That keeps the core contradiction in place: a non-activated window cannot serve as a guaranteed typing surface.

## Option 2: activate scratch on open and make the preset menu scratch-local

Accepted.

This aligns the implementation with the user’s actual workflow and fixes the root ownership problem instead of papering over it.

## Option 3: keep scratch non-activating but forward the preset shortcut into it anyway

Rejected.

This might make the menu appear, but it still leaves the textarea focus contract unresolved and keeps scratch in an awkward half-active state.
