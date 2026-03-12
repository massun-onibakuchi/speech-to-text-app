<!--
Where: docs/github-pages-product-lp-design-note.md
What: Design note for the GitHub Pages landing-page hero and product-view refresh.
Why: Record the accepted Ticket 1 decisions so later PRs preserve the intended structure.
-->

# GitHub Pages Product LP Design Note

## Ticket 1 decisions

- The hero now uses a centered editorial stack: headline first, fixed subheadline and CTAs second, demo third.
- The Notes, Slack, and Terminal demo internals are intentionally preserved so the redesign stays reviewable and low-risk.
- The old floating hero chrome was removed instead of restyled. The label row above the demo now carries the scene context.
- The rotating headline remains in the hero, but the copy is constrained to `The Swiss Army Knife` / `for` / rotating word.
- The features heading is rendered as two intentional lines to protect `Your text shouldn't be.` from accidental mid-phrase wrapping on desktop layouts.

## Product-view alignment

- `Run selected profile` now shows one text block that changes in place from rough dictation to a cleaner formatted result.
- `Reusable profile` is rendered as a single-column selectable list centered on the saved profiles themselves.
- `User dict` is rendered as a two-column table with `key` and `value` headers.

## Follow-up boundary

- Ticket 1 does not change autoplay timing or add manual tab interaction.
- Ticket 2 should keep using the same hero containers and label row when it adds the fixed 4-second switching behavior.
