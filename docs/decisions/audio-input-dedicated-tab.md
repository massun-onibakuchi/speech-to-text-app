<!--
Where: docs/decisions/audio-input-dedicated-tab.md
What: Decision record for moving Audio Input controls to their own workspace tab.
Why: Issue #251 requests dedicated IA placement for recording device controls.
-->

# Decision: Audio Input Gets Dedicated Tab (#251)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #251

## Decision

Introduce `audio-input` as a first-class workspace tab adjacent to `shortcuts` and mount `SettingsRecordingReact` there.

## Consequences

- Settings tab no longer contains audio-input section;
- recording method/sample-rate/device controls keep existing IDs and callback contracts;
- tab model becomes: `activity | profiles | shortcuts | audio-input | settings`.
