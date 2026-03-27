---
title: Scratch space popup uses native macOS title bar chrome
description: Keep macOS traffic lights outside the scratch-space renderer content instead of simulating clearance with renderer padding.
date: 2026-03-27
status: accepted
tags:
  - adr
  - scratch-space
  - macos
  - renderer
---

# Context

The scratch-space popup is a small floating utility window. On macOS, the window controls live in the title bar area. An earlier implementation used `titleBarStyle: hiddenInset` and then added renderer-side padding and a drag strip to keep the traffic lights from overlapping the textarea.

That approach created the wrong ownership boundary:
- window chrome concerns leaked into the renderer layout
- the popup body gained avoidable top margin
- the draft panel looked taller and more distant from the window edge than intended

# Decision

On macOS, the scratch-space popup will use the native title bar instead of hidden-inset chrome.

The renderer will treat the full web contents area as application content and will not reserve traffic-light clearance with spacer elements or drag-strip padding.

The native title bar color must match the renderer canvas background so the popup reads as one continuous surface instead of separate chrome and content bands.

# Consequences

Positive:
- traffic lights stay outside the renderer where they belong
- popup spacing can stay compact and consistent with the rest of the renderer system
- future layout changes do not need to reason about platform window controls inside React

Negative:
- the popup uses a more standard macOS utility-window appearance instead of custom chrome
- platform-specific chrome behavior now lives in the window-service configuration rather than one shared title-bar style

# Notes

This ADR only changes window-chrome ownership. It does not change scratch-space behavior, hotkeys, profile selection, or transform-and-paste semantics.
