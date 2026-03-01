<!--
Where: docs/decisions/remove-home-and-recording-helper-text.md
What: Decision record for removing low-value instructional helper copy from Home and Recording settings UI.
Why: Issue #294 requests cleaner panels without redundant instructional text or leftover spacing.
-->

# Decision: Remove Home/Recording Helper Text

## Status
Accepted - March 1, 2026

## Context
Two helper strings added visual noise without adding actionable value for current v1 workflows:
- Home idle helper text: `Click to record`
- Recording helper text in settings: `Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.`

Issue #294 requires these texts to be removed without introducing spacing regressions.

## Decision
- Remove idle helper text from the Home recording panel.
- Remove the recording helper paragraph from the recording settings component (all section modes).
- Keep existing functional controls, blocked-state messaging, and command behavior unchanged.

## Consequences
- Home and settings panels are less verbose and visually cleaner.
- Layout remains stable because only text nodes were removed; control structure is unchanged.
- Tests are updated to enforce absence of removed strings.
