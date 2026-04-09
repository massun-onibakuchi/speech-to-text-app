---
title: Add a focused-only scratch-space action menu and three-level Escape ownership
description: Record the separate local Cmd+K action menu and the nested Escape order that extends the original scratch-space focus contract.
date: 2026-04-09
status: accepted
tags:
  - architecture
  - scratch-space
  - renderer
  - electron
  - keyboard
---

# Context

ADR 0014 established two durable points:

- scratch space should open as an activating typing surface
- while scratch is visible, `pickTransformation` should open a scratch-local preset menu instead of the global picker

The shipped implementation and current spec now go further than ADR 0014 recorded:

- focused scratch space exposes a separate local `Cmd+K` action menu
- that menu provides transform-and-copy and transform-and-paste actions
- `Escape` ownership is three-level, not two-level:
  - preset menu first
  - `Cmd+K` action menu second
  - scratch close last

That behavior is already part of the durable scratch-space contract and needs its own decision record instead of silently rewriting ADR 0014.

## Decision

Scratch space should keep two distinct scratch-local menus with separate entry points and a shared nested keyboard stack.

Specific decision points:

- the configured global `pickTransformation` shortcut opens the scratch-local preset menu only while scratch is visible
- focused scratch space on macOS exposes a separate local `Cmd+K` action menu
- the `Cmd+K` action menu stays renderer-local and does not register as a global shortcut
- the `Cmd+K` action menu provides:
  - transform-and-copy
  - transform-and-paste
- `Escape` inside scratch follows this precedence:
  - close the preset menu first
  - close the `Cmd+K` action menu second
  - close scratch third
- if a scratch execution fails after the window hides, scratch reopens with the same draft and selected profile, remains immediately interactive, and comes back with the `Cmd+K` action menu closed

## Why this decision

This keeps scratch-space-local behavior coherent without overloading one menu with two unrelated jobs.

It improves correctness:

- the preset menu remains responsible only for profile selection
- the `Cmd+K` menu remains responsible only for scratch execution actions
- nested `Escape` ownership is explicit and testable

It improves UX consistency:

- the global preset shortcut still works outside scratch
- the focused-only `Cmd+K` menu behaves like a local editor command palette
- failure recovery returns the user to a predictable retry state

It keeps architecture boundaries clear:

- global picker logic stays in main-process popup flow
- scratch-local menus stay in renderer-local state
- the decision history remains append-only instead of rewriting ADR 0014

## Consequences

Positive:

- scratch has a clear separation between preset selection and execution actions
- `Cmd+K` does not consume or compete for a global shortcut registration
- retry reopen behavior preserves user context without reopening nested menus

Negative:

- scratch now has two local overlays to coordinate instead of one
- the durable decision chain spans ADR 0014 and this successor ADR
- renderer and E2E tests must keep both local menus and their interaction covered

## Options considered

## Option 1: fold preset selection and execution actions into one scratch-local menu

Rejected.

That mixes two different responsibilities and makes keyboard ownership harder to reason about.

## Option 2: keep a separate focused-only `Cmd+K` action menu with explicit Escape precedence

Accepted.

This matches the shipped spec and implementation while preserving clear ownership boundaries.

## Option 3: silently expand ADR 0014 to include the new action menu behavior

Rejected.

That would lose decision history and violate the repo's append-mostly ADR governance.
