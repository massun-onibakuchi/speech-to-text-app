<!--
Where: docs/decisions/home-idle-settings-button-removal.md
What: Decision record for removing the idle-state Settings button from Home.
Why: Simplify the idle recording surface while keeping blocked-state guidance.
-->

# Remove Idle-State Home Settings Button — Decision Record

**Issue:** #199  
**Date:** 2026-02-28  
**Status:** Implemented

## Context

The Home panel idle state showed a low-emphasis `Settings` button below `Click to record`.
This duplicated navigation affordances already available in the tab rail.

## Decision

- Remove the idle-only `Settings` button from Home.
- Keep blocked-state `Open Settings` guidance/button when recording prerequisites are missing.

## Impact

- Idle Home UI is simpler and focused on the primary record action.
- Recovery affordance for blocked recording remains unchanged.
