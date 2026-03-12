<!--
Where: docs/github-pages-product-lp-design-note.md
What: Design note for the GitHub Pages landing-page hero and product-view refresh.
Why: Record the accepted Ticket 1 decisions so later PRs preserve the intended structure.
-->

# GitHub Pages Product LP Design Note

## Ticket 1 decisions

- The hero now follows a left-copy, centered-demo composition on desktop while the top bar stays in its existing navigation pattern.
- The hero copy sits in a shallow intro band above the demo rather than a viewport-height centered stack.
- The Notes, Slack, and Terminal demo internals are intentionally preserved so the redesign stays reviewable and low-risk.
- The old floating hero chrome was removed instead of restyled. The label row above the demo now carries the scene context.
- The rotating headline remains in the hero, but the copy is constrained to `The Swiss Army Knife` / `for` / rotating word.
- The headline scale was reduced from the first draft so the left-copy composition stays readable on laptop-height viewports.
- The features heading is rendered as two intentional lines to protect `Your text shouldn't be.` from accidental mid-phrase wrapping on desktop layouts.

## Product-view alignment

- `Run selected profile` now shows one text block that changes in place from rough dictation to a cleaner formatted result.
- `Reusable profile` is rendered as a single-column selectable list centered on the saved profiles themselves.
- `User dict` is rendered as a two-column table with `key` and `value` headers.

## Follow-up boundary

- Ticket 1 does not change autoplay timing or add manual tab interaction.

## Ticket 2 decisions

- Ticket 2 keeps the Ticket 1 hero containers intact and only retunes hero behavior.
- The label row remains contextual only and sits below the demo shell in this revision.
- The labels are fixed English UI terms in the approved order: `Notes`, `Slack`, `Terminal`.
- `Terminal` continues to map to the existing `claude` demo scene instead of introducing a fourth renderer.
- Demo autoplay keeps per-scene timing so the Slack, Notes, and Terminal animations can remain readable.
- The rotating headline stays synced with demo autoplay so the word and active scene continue to move together.
- With `prefers-reduced-motion`, the hero stays on its current scene and headline word instead of continuing autoplay.
