<!--
Where: specs/github-pages-product-lp-plan.md
What: Step-by-step delivery plan for the GitHub Pages product landing page redesign.
Why: Break the redesign into reviewable PR-sized tickets before implementation begins.
-->

# GitHub Pages Product LP Redesign Plan

## Planning context

- PR target branch: `feat/github-pages-product-lp`
- Planning rule: `1 ticket = 1 PR`
- Current confirmed scope:
  - Hero-only redesign
  - Keep the existing three app demo surfaces
  - Move headline copy above the demo
  - Center the demo like the supplied `Cursor` reference
  - Add context labels for the demo in this order: `Notes`, `Slack`, `Terminal`
  - Highlight the active label
  - Keep per-scene timing adjustable based on visual pacing
  - With `prefers-reduced-motion`, disable autoplay and keep the current scene static
  - Keep demo chrome minimal: centered app frame plus labels above it, no extra floating chrome
  - Keep the rotating hero concept, but only in the headline:
    - `The Swiss Army Knife`
    - `for X`
    - `X = Speech / Ideas / Code`
  - Subheadline copy is fixed as:
    - `Fast voice capture. Clean text.`
    - `Works anywhere you type.`
  - CTA copy is fixed as:
    - `Download Dicta`
    - `View on GitHub`
  - Features section heading `Speech is messy. Your text shouldn't be.` must render as two intentional lines and must not break mid-phrase inside `Your text`
  - Product View card requirements are fixed as:
    - `Run selected profile`: show unformatted text first, then replace that same text in place using animation
    - `Reusable profile`: show a single-column selectable profile list with `Translation`, `Optimize Prompt`, `Business`, and `+ add Profile`
    - `User dict`: show a two-column table with `(key, value)`
- Out of scope for this plan:
  - Rebuilding the Notes, Slack, or Claude demo internals from scratch
  - Broad redesign of lower page sections beyond what is required for hero consistency
  - New dependencies

## Delivery sequence

1. PR 1: Recompose the hero layout and copy hierarchy around the existing demo, with baseline tests and a short design note update.
2. PR 2: Replace the current hero scene behavior with labeled tabs and fixed 4-second autoplay, with behavior-specific tests.
3. PR 3: Final regression hardening and decision record only if meaningful work remains after PR 1 and PR 2.

## Explicit typography constraints

- The features heading copy remains:
  - `Speech is messy.`
  - `Your text shouldn't be.`
- The implementation must enforce this as an intentional two-line heading on desktop marketing layouts.
- Do not allow the browser to produce an accidental break such as splitting in the middle of `Your text`.
- If responsive behavior requires a single-line fallback on narrower widths, it must still preserve phrase integrity.

## Explicit product-view constraints

- `Run selected profile`
  - Must communicate a before-to-after transformation clearly.
  - The starting state is visibly unformatted text.
  - The updated state replaces the same text in place rather than rendering as a detached after-panel.
  - Animation should be a simple in-place text morph/replace in the same text block.
- `Reusable profile`
  - Must read as a selectable list of profiles, not a two-pane settings editor.
  - Required visible items:
    - `Translation`
    - `Optimize Prompt`
    - `Business`
    - `+ add Profile`
  - Layout is one column of items.
  - `Optimize Prompt` is the selected item by default.
- `User dict`
  - Must render as a table with exactly two conceptual columns:
    - `key`
    - `value`
  - Avoid grouped card layouts that obscure the table structure.
  - Reuse the current example rows where possible.
  - Existing wording stays unchanged unless implementation constraints force a follow-up decision.

## Ticket 1

### P0: Recompose Hero Layout Around The Existing Demo

### Goal

Align the top-of-page composition with the requested `Cursor`/`Raycast` reference: a centered top-stacked hero, rotating `Speech / Ideas / Code` headline treatment, fixed subheadline and CTAs, and no structural rewrite of the three existing app views.

### Why this is first

This is the foundation ticket. The tab behavior and autoplay should not be implemented until the layout containers and semantic hero structure are stable.

### Scope files

- `site/src/app.tsx`
- `site/src/styles.css`
- `site/src/content/en.ts`
- `site/src/content/ja.ts`
- `site/src/content/types.ts` only if the copy model needs minimal reshaping
- `site/src/app.test.tsx` for baseline coverage tied to the new hero composition
- `docs/github-pages-product-lp-design-note.md` for the initial design note

### Approach

- Keep the existing topbar and lower sections intact unless hero spacing changes force small follow-up alignment.
- Convert the hero from a left-copy/right-demo split into a vertically stacked composition.
- Preserve the existing Notes, Slack, and Claude scene renderers as-is.
- Tighten hero copy into a centered block above the demo frame.
- Keep the rotating-word mechanic, but constrain it to the headline only:
  - line 1: `The Swiss Army Knife`
  - line 2: `for`
  - line 3: rotating word
- Replace the old side-by-side composition with a centered editorial stack.
- Make an explicit cleanup decision for old hero-only selectors and markup:
  - `.hero-preview-scene-tabs`: remove or replace in PR 1
  - `.hero-voice-pill`: remove or replace in PR 1
  - rotating headline classes: keep only the subset still needed by the accepted hero copy

### Non-goals

- Do not change scene sequencing or timer behavior in this PR
- Do not redesign lower page sections beyond layout fallout from the hero change
- Do not rewrite the internal Notes, Slack, or Claude demo surfaces
- Do not rewrite the features section copy beyond enforcing the intentional two-line break
- Do not leave the current product-view cards unchanged if they conflict with the approved card layouts above

### Checklist

- [ ] Hero copy is stacked above the demo, not beside it
- [ ] Demo is visually centered in the hero section
- [ ] Existing app scene renderers remain reusable and intact
- [ ] Headline/subtext/CTA spacing matches the requested editorial composition
- [ ] Copy reflects the new top-first layout and no longer depends on the old rotating-word treatment

### Tasks

#### Chunk 1: Normalize hero content structure

- Review the current hero-specific copy fields in `site/src/content/en.ts` and `site/src/content/ja.ts`
- Update hero copy to the accepted structure:
  - static lead: `The Swiss Army Knife`
  - static bridge: `for`
  - rotating words: `Speech`, `Ideas`, `Code`
  - subheadline: `Fast voice capture. Clean text. Works anywhere you type.`
  - primary CTA: `Download Dicta`
  - secondary CTA: `View on GitHub`
- Simplify the hero JSX so it matches the new centered composition without changing demo behavior

#### Chunk 2: Restructure hero markup

- Refactor the `hero` section in `site/src/app.tsx`
- Create a clear wrapper hierarchy for:
  - Hero copy block
  - Demo label row
  - Demo shell
- Keep the demo render branch isolated from copy changes
- Preserve the rotating headline area while moving it above the demo

#### Chunk 3: Restyle the hero shell

- Update the `hero`, `hero-copy`, `hero-body`, `hero-actions`, and `hero-visual` styles
- Ensure the demo remains centered across desktop and mobile breakpoints
- Preserve the premium dark presentation while reducing visual clutter around the hero
- Remove extra floating chrome so the hero reads as headline first, app frame second

#### Chunk 3.5: Align product-view cards with approved layouts if shared styles are touched

- Audit whether current product-view card structure conflicts with the approved constraints
- If hero/layout work changes shared marketing styles, keep the card intent intact and record any follow-up needed for the dedicated product-view ticket

#### Chunk 4: Add baseline regression protection

- Update tests that assert the old rotating headline layout
- Add at least one assertion for the new top-stacked composition
- Add a short design note describing why the demo internals are intentionally preserved
- Note the typography rule for the features heading if hero/layout work changes shared heading styles

### Gates

- Gate 1: The top of the page reads correctly without any scene switching
- Gate 2: The demo remains centered and visually dominant at standard desktop widths
- Gate 3: Mobile layout does not push the demo off-screen or create horizontal overflow
- Gate 4: No lower section is accidentally broken by the hero container changes
- Gate 5: Top nav spacing still reads correctly after hero compression
- Gate 6: Old hero-only selectors are either removed or intentionally retained with rationale
- Gate 7: The rotating word remains in the headline and no longer drives demo order
- Gate 8: Shared heading style changes do not reintroduce awkward wrapping in the features heading

### Trade-offs

- Removing the rotating-word headline reduces motion and novelty, but improves clarity and aligns with the user’s latest direction.
- Keeping the existing demo internals avoids unnecessary churn, but it means the new hero must be designed around current scene dimensions instead of reauthoring them from scratch.

### Potential risks

- Existing styles are large and tightly coupled; hero selector changes can create regressions in shared spacing.
- Locale-specific headline lengths may wrap differently once centered.
- The current demo widths may require container constraints to avoid awkward empty space on ultrawide screens.

### Feasibility

High. This is a contained marketing-site refactor with no dependency changes and no runtime contract changes outside the static site.

### Code sketch

```tsx
<section className="hero" id="hero">
  <div className="hero-copy">
    <h1>{copy.heroTitle}</h1>
    <p className="hero-body">{copy.heroBody}</p>
    <div className="hero-actions">...</div>
  </div>

  <div className="hero-demo">
    <div className="hero-demo-labels">...</div>
    <div className="hero-preview-shell">{activeSceneMarkup}</div>
  </div>
</section>
```

## Ticket 2

### P1: Add Context Labels And 4-Second Demo Switching

### Goal

Replace the current hero scene behavior with explicit context labels for `Notes`, `Slack`, and `Terminal`, keep the active label visually highlighted, and preserve independent scene timing tuned for each demo.

### Why this is second

This work depends on Ticket 1’s layout containers. It should land only after the hero markup and styling are stable.

### Scope files

- `site/src/app.tsx`
- `site/src/styles.css`
- `site/src/content/en.ts` only if labels need locale-managed copy
- `site/src/content/ja.ts` only if labels need locale-managed copy
- `site/src/content/types.ts` only if label copy is formalized into types
- `site/src/app.test.tsx`
- `docs/github-pages-product-lp-design-note.md`

### Approach

- Use the existing preview scene state as the base, but decouple it from the current rotating-word headline.
- Reorder scene labels to match the requested UX: `Notes`, `Slack`, `Terminal`.
- Map `Terminal` to the existing `claude` preview scene.
- Keep scene timing configurable so Notes, Slack, and Terminal can be paced independently.
- Treat labels as contextual scene indicators unless a later revision requires manual tab controls.
- Acceptance decision:
  - labels stay as fixed English UI terms unless the user later asks for localization
  - reduced-motion disables autoplay and leaves the current scene static
- Keep the rotating headline active independently from the demo tabs so headline motion and demo motion are no longer coupled
- Explicit timer/effect areas likely to change in `site/src/app.tsx`:
  - `HERO_SCENE_ROTATE_MS`
  - `setHeroSceneIndex` autoplay effect
  - any effect coupling between scene rotation and rotating hero word logic
  - scene-reset effects for Slack, Notes, and Claude animations

### Non-goals

- Do not redesign lower sections
- Do not introduce new product copy outside label text required for the demo controls
- Do not replace the current scene renderer internals
- Do not alter the approved two-line phrasing of the features heading
- Do not modify product-view card internals in this PR unless needed for breakage caused by hero work

### Checklist

- [ ] Labels appear above the demo in the order `Notes`, `Slack`, `Terminal`
- [ ] Labels appear in the order `Notes`, `Slack`, `Terminal`
- [ ] Active label has a clear highlighted state
- [ ] Demo timing remains deliberate and scene-appropriate
- [ ] Existing Notes, Slack, and Claude animations still run when their scene becomes active

### Tasks

#### Chunk 1: Normalize scene metadata

- Introduce a single scene definition array with:
  - stable scene key
  - UI label
  - mapping to existing render function
- Remove assumptions that hero word order equals scene order
- Keep a separate rotating headline word source for `Speech`, `Ideas`, `Code`

#### Chunk 2: Tune autoplay timing model

- Remove hard assumptions that all scenes should share one interval
- Keep timer cleanup disciplined so scene changes do not stack effects
- Tune per-scene timing to match each demo's readability

#### Chunk 3: Present scene labels

- Render labels in the approved order
- Keep the active scene visually obvious
- Avoid introducing manual tab behavior unless explicitly requested

#### Chunk 4: Preserve per-scene animations

- Verify Slack composer, Notes bullet reveal, and Claude prompt streaming still reset correctly on scene change
- Adjust effect dependencies only where necessary

#### Chunk 5: Add behavior-specific coverage

- Add tests for label order, active-state highlighting, and current scene timing behavior
- Add a reduced-motion test that confirms autoplay is disabled
- Add a test that confirms the headline rotator still changes independently from the demo state

### Gates

- Gate 1: The active tab is visually obvious at all times
- Gate 2: Auto-rotation timing matches the approved pacing for each scene
- Gate 3: Scene resets remain deterministic across autoplay transitions
- Gate 4: Labels remain visually legible and correctly highlighted
- Gate 6: Locale switching does not break tab order or active-scene mapping
- Gate 7: Reduced-motion behavior is explicit, deliberate, and tested
- Gate 8: Headline rotation still works after demo autoplay is decoupled
- Gate 9: Demo/layout styling changes do not regress the intentional two-line features heading

### Trade-offs

- Per-scene timing reads better for the current demo content, but it makes the autoplay model less uniform.
- Avoiding manual click support keeps the hero simpler, but it leaves scene selection fully presentation-driven.

### Potential risks

- Timer interactions may leave stale animation state in Notes or Claude if cleanup is incomplete.
- Reordering the labels without reordering the internal scenes carefully could create mismatched active states.
- Locale switching could recreate timing effects unexpectedly if dependencies are too broad.

### Feasibility

High. The behavior is already timer-driven; this ticket keeps the existing architecture and tunes it to the approved pacing.

### Code sketch

```tsx
const HERO_DEMO_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'slack', label: 'Slack' },
  { id: 'claude', label: 'Terminal' }
] as const

useEffect(() => {
  if (prefersReducedMotion) return

  const intervalId = window.setInterval(() => {
    setHeroSceneIndex((current) => (current + 1) % HERO_DEMO_TABS.length)
  }, 4000)

  return () => window.clearInterval(intervalId)
}, [prefersReducedMotion])
```

## Ticket 3

### P2: Regression Hardening And Decision Record

### Goal

Capture the final redesign decisions, close any remaining regression gaps after PR 1 and PR 2, and run targeted verification only if enough distinct work remains to justify a third PR.

### Why this is third

This ticket exists only if PR 1 and PR 2 leave meaningful follow-up work. It should not be the first point where tests or docs appear.

### Scope files

- `site/src/app.test.tsx` for net-new hardening only
- `docs/github-pages-product-lp-design-note.md`
- Optional: `site/src/index-html.test.ts` only if metadata or top-level structure changes require it
- `site/src/app.tsx` and `site/src/styles.css` only if product-view hardening remains after PR 1 and PR 2

### Approach

- Assume baseline test/doc updates already landed in PR 1 and PR 2.
- Limit this PR to:
  - net-new hardening where real gaps still exist
  - final verification notes
  - the completed design decision record if earlier PRs only added a stub
- If product-view cards still diverge from the approved layouts after PR 1 and PR 2, use this PR for that hardening only if it remains a distinct, reviewable slice
- Record the final redesign rationale in docs so future revisions understand:
  - why the hero keeps the existing demo internals
  - why `Terminal` maps to the `claude` scene
  - why autoplay is fixed to 4 seconds
  - why reduced-motion disables autoplay
  - why the headline rotator remains while the demo is visually simplified
  - why the product-view cards use a transformation-in-place preview, a single-column profile list, and a 2-column user dictionary table
  - why only the specifically requested product-view cards changed while wording stayed unchanged

### Checklist

- [ ] This PR exists only if distinct remaining work is real
- [ ] Any remaining regression gaps are closed with targeted assertions
- [ ] Docs explain scope, constraints, and chosen implementation approach
- [ ] Verification commands are listed and expected outcomes are clear
- [ ] Product-view cards match the approved layouts if this PR includes that hardening

### Non-goals

- Do not defer obvious missing tests from PR 1 or PR 2 into this PR
- Do not introduce fresh visual redesign work
- Do not expand scope beyond hardening and decision capture

### Tasks

#### Chunk 1: Refresh tests

- Add only the extra assertions still missing after PR 1 and PR 2
- Prefer coverage for edge cases such as locale switches, focus state, or reduced-motion regressions
- If product-view hardening lands here, add assertions for:
  - in-place replacement in `Run selected profile`
  - one-column profile list items
  - 2-column dictionary table semantics

#### Chunk 2: Write a design decision note

- Capture:
  - what changed
  - what stayed unchanged
  - why existing app views were preserved
  - why fixed autoplay was chosen
  - why labels remain English UI terms unless explicitly changed later
  - what happened to deprecated hero classes/selectors
  - the approved product-view card structures and why they were chosen

#### Chunk 3: Verification runbook

- Run targeted tests for the landing page
- Run the site build
- Check for layout regressions at desktop and mobile widths if implementation includes visual verification

### Gates

- Gate 1: Tests no longer encode the old hero behavior
- Gate 2: New tests fail if label order or 4-second timing regresses
- Gate 3: Documentation is specific enough for a future contributor to preserve the intended UX
- Gate 4: Build and targeted tests pass before merge
- Gate 5: This PR is not carrying baseline work that should have shipped earlier
- Gate 6: Product-view cards follow the approved structure if they are touched in this PR

### Trade-offs

- Keeping PR 3 optional preserves cleaner PR boundaries, but it may disappear entirely if PR 1 and PR 2 are complete enough.
- A separate hardening PR is useful only when it addresses concrete residual risk, not when it acts as a catch-all cleanup bucket.

### Potential risks

- Existing tests may be more tightly coupled to old DOM structure than expected.
- If the implementation introduces new class names inconsistently, tests may become brittle.
- A docs note that is too brief will not explain why the hero keeps legacy scene renderers.
- If PR 3 is forced without enough remaining work, it will be an artificially split PR with low review value.

### Feasibility

High. The current site already has targeted component tests; this ticket is incremental test maintenance plus documentation.

### Code sketch

```tsx
const labels = Array.from(host.querySelectorAll('.hero-demo-tab')).map((node) => node.textContent?.trim())

expect(labels).toEqual(['Notes', 'Slack', 'Terminal'])
expect(host.querySelector('.hero-demo-tab.is-active')?.textContent?.trim()).toBe('Notes')

await act(async () => {
  vi.advanceTimersByTime(4000)
})

expect(host.querySelector('.hero-preview-shell')?.getAttribute('data-preview-scene')).toBe('slack')
```

## Review criteria for the plan

- Ticket granularity:
  - Each ticket should be independently reviewable and mergeable as one PR.
- Ticket priority:
  - Layout first, behavior second, verification third.
- Feasibility:
  - No new dependencies, no rewrite of demo internals, and reuse of existing site architecture.
- Potential risk:
  - Most risk lives in timer cleanup and CSS coupling, not in product logic.
- Proposed approaches:
  - Prefer incremental refactor of hero containers and timer state over wholesale page rewrite.

## Exit condition before coding

Implementation should not begin until this plan is reviewed, updated from review feedback, and accepted as the working PR sequence.
