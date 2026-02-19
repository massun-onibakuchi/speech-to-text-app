# UX Practical Checklist (asset)
#
# Where: Used by the `ux-design` Codex skill as a practical checklist.
# What: A concise, implementation-oriented UX checklist (patterns + pitfalls).
# Why: Complement the psychology playbook with “what to do” guidance.

## 1) Scope and focus

- [ ] Identify the primary user goal for this screen/flow in 1 sentence.
- [ ] Remove non-essential content/actions from the default view.
- [ ] Optimize for the common case first; don’t let edge cases dominate the UI.
- [ ] Allow users to defer non-essential decisions/fields.

## 2) Learnability and control

- [ ] Match the UI to user mental models; use familiar conventions and idioms.
- [ ] Make affordances obvious (what’s clickable/tappable and what happens).
- [ ] Keep behavior consistent across the product (same meaning, same presentation).
- [ ] Preserve user control: undo/reversibility, clear exits, no “gotcha” modes.

## 3) Information architecture and navigation

- [ ] Organize around objects users care about (not internal procedures).
- [ ] Provide wayfinding: where am I, where can I go, how do I go back/home?
- [ ] Keep navigation/menu item positions stable to support muscle memory.
- [ ] Keep tools close to the work to minimize context switching.

## 4) Visual structure and content presentation

- [ ] Create clear visual hierarchy (what’s most important first).
- [ ] Use grouping/alignment/spacing to communicate structure at a glance.
- [ ] Prefer showing (visuals/previews) and supporting with concise text.
- [ ] Make scrollability and “more content below” obvious when relevant.

## 5) Forms and input design

- [ ] Use good defaults; pre-fill known values; minimize required fields.
- [ ] Prefer selection over typing; constrain inputs to valid formats when helpful.
- [ ] Use clear, affirmative labels; use specific verbs on primary buttons.
- [ ] Avoid ambiguous toggles (the “flip-flop” problem); separate state from action.
- [ ] Be forgiving: accept input variations and normalize internally.

## 6) Feedback, performance, and motion

- [ ] Provide immediate feedback near the user’s point of action.
- [ ] Keep the UI responsive; avoid long “locked” states.
- [ ] If an action takes time, show progress and/or remaining time.
- [ ] Use short, explanatory transitions for large state changes; support reverse flows.

## 7) Error prevention and recovery

- [ ] Prevent errors with constraints and sensible disabling (not just messages).
- [ ] Prefer fail-safe designs (undo) over trying to make mistakes impossible.
- [ ] Confirm only irreversible/high-risk actions (potential data loss).
- [ ] When errors occur, say what happened and what to do next (no error codes).

## 8) Accessibility and internationalization

- [ ] Ensure touch targets are comfortably tappable; enlarge hotspots without hiding them.
- [ ] Support screen readers (alt text / semantics) and text enlargement.
- [ ] Don’t rely on color alone; verify with grayscale/low-contrast scenarios.
- [ ] Avoid culture-specific or ambiguous symbols; account for label length in localization.

## 9) Respect and impact

- [ ] Avoid “game-like” UX when users are trying to complete real tasks.
- [ ] Treat the UI as the user’s tool (amplify intent; don’t coerce).
- [ ] Check that the design benefits users long-term, not only short-term metrics.

