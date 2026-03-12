<!--
Where: docs/plans/2026-03-12-lp-preview-and-product-view-refresh-plan.md
What: Step-by-step implementation plan for the next landing-page hero and product-view refresh.
Why: Convert feedback into reviewable, one-ticket-per-PR execution chunks before any code changes begin.
-->

# Dicta LP Preview And Product View Refresh Plan

Date: 2026-03-12  
Status: Proposed  
Scope: `site/` landing page only  
Execution rule: do not start implementation until this plan is reviewed and accepted

## Feedback Summary

### Visual and copy issues

- The current hero feels cramped in both copy density and spatial balance.
- The current hero preview only shows a Slack-like surface, so the product feels narrower than requested.
- The current product-view illustrations are too static and too simple for the stories they need to tell.
- The Slack preview composer shows awkward extra spacing between words in the generated sentence, especially around `The Q3 brief now reflects the approved margin. Finance can review the revised sheet this morning.`

### Requested changes

1. Add Apple Notes.app-style UI and Claude Code terminal UI to the hero preview rotation.
2. Rotate preview scenes every few seconds: `Slack -> Apple Notes.app -> Claude Code Terminal -> Slack -> ...`
3. Dynamically illustrate how unformatted text becomes a well-structured Markdown prompt.
4. Show a profile list view with `Translation`, `Optimize Prompt`, `Business`, and `+ add profile`.
5. Show multiple key-value tables for the user dictionary with these examples:
   - `clade code: Claude code`
   - `codex: Codex`
   - `pull request: PR`
   - `User A: Alice`
6. In the Apple Notes scene, animate selected text being cleanly replaced by bullet points in an Apple Notes-like editing flow.
7. In the Claude Code scene, show prompt text appearing incrementally word by word in a black terminal, similar to the current Slack composer reveal.
8. Keep the waving icon visible regardless of which preview scene is active.

## Delivery Strategy

- One ticket maps to one PR.
- Tickets are sorted by priority and dependency order.
- Each PR must keep the landing page buildable and visually coherent on its own.
- Each PR must include tests and a small docs update.
- Each PR must include an `agent-browser` review pass for screenshotting and checking style/UI before merge.

## Locked Clarifications

- Preview rotation should auto-rotate and pause on hover/focus.
- Apple Notes fidelity target is very close to the official Notes.app design.
- Claude Code scene should be terminal-only.
- Claude Code terminal should show a welcome-back screen first, then the prompt, then incremental action/output text.
- Profile list entries `Translation`, `Optimize Prompt`, and `Business` are demo profile names.
- Dictionary table headers should use `Input` and `Replace with`.
- FAQ wording must stay unchanged.
- Main hero wording, including `The Swiss Army Knife for ...`, must stay unchanged.
- Usage section wording must stay unchanged.
- The Apple Notes and Claude Code preview scenes must mimic the user-provided screenshots in style and view, not merely take loose inspiration from them.

## Visual Target Inputs

- Reference A: user-provided Claude Code screenshot
  - Treat this as the required target for terminal chrome, dark surface treatment, typography feel, spacing rhythm, prompt/output composition, and overall view structure.
- Reference B: user-provided Apple Notes screenshot
  - Treat this as the required target for notes-sidebar proportions, window chrome, typography scale, editor spacing, and overall Notes layout.

## Ticket List

### Ticket LP-01 / PR-01

Priority: P0  
Title: Decompress the hero and add rotating multi-scene preview

#### Goal

Reduce the cramped feeling in the hero and expand the preview beyond the Slack-like scene by shipping the full rotating sequence: `Slack -> Apple Notes -> Claude Code -> Slack`.

#### Checklist

- [ ] Keep main hero wording unchanged while improving styling/layout
- [ ] Increase visual whitespace in the hero layout
- [ ] Remove the Slack composer word-spacing artifact in the animated sentence
- [ ] Define a typed scene model for Slack, Apple Notes, and Claude Code
- [ ] Rotate scenes automatically in a loop
- [ ] Animate Apple Notes text selection and replacement into bullet points
- [ ] Animate Claude Code prompt output word by word in a black terminal scene
- [ ] Keep the waving icon persistent across all preview scenes
- [ ] Keep scene motion accessible and stable
- [ ] Confirm the hero remains balanced at desktop and tablet widths
- [ ] Add or update tests that assert the revised hero copy and preview model
- [ ] Use `agent-browser` to capture screenshots and inspect hero UI/style before closing the PR
- [ ] Update landing-page docs with the new hero intent and rotation behavior

#### Tasks

1. Audit the current hero title, body, CTA grouping, and spacing pressure without changing the locked hero wording.
2. Fix the Slack composer rendering so animated words keep normal sentence spacing while still revealing progressively.
3. Adjust hero grid ratios, max widths, and vertical spacing.
4. Introduce a typed `previewScene` model and render helpers.
5. Build an Apple Notes scene that mimics the provided Apple Notes screenshot closely in style and view while fitting the LP composition.
6. Animate text selection in the Apple Notes scene and replace the selected text with polished bullet points.
7. Build a black Claude Code-style terminal scene that shows:
   - a welcome-back screen
   - a visible prompt block
   - incremental word-by-word prompt appearance
   - incremental action/output lines after the prompt
8. Keep the waving icon mounted outside scene-specific content so rotation never removes it.
9. Add timer cleanup, reduced-motion handling, and explicit autoplay rules, with pause-on-hover/focus behavior.
10. Run the local site, use `agent-browser` to capture screenshots of each preview scene, and check spacing, fidelity, and motion states.

#### Gates

- Hero body fits comfortably without reading as a dense paragraph.
- Main hero wording remains unchanged.
- No CTA wrapping regression at standard desktop widths.
- Locale switch and nav still fit in the header without crowding.
- Slack composer text renders with normal word spacing throughout the full sentence animation.
- Scene loop order is exactly `Slack -> Apple Notes -> Claude Code -> Slack`.
- The waving icon remains visible across Slack, Apple Notes, and Claude Code scenes.
- The Apple Notes scene visibly shows selection followed by clean bullet-list replacement and mimics the provided Notes screenshot closely in style and view.
- The Claude Code scene visibly shows a welcome-back screen, then prompt and action/output text appearing incrementally in a terminal-style output area, and mimics the provided Claude Code screenshot closely in style and view.
- Auto-rotation honors `prefers-reduced-motion`.
- All timers are cleaned up on unmount.
- Autoplay pauses on hover/focus and resumes cleanly afterward.
- Scene rotation does not hide the primary hero message or break keyboard use.
- `agent-browser` screenshots are captured for Slack, Apple Notes, and Claude Code scenes and reviewed for style/UI quality.
- `pnpm test -- site/src/app.test.tsx`, `pnpm run typecheck`, and `pnpm run site:build` pass.

#### Approach

Ship hero layout and hero preview rotation together because the user feedback treats them as one problem: the hero feels cramped and too narrow in product representation. Keep the hero wording locked, use the supplied screenshots as mimic targets for style/view, and solve the issue through spacing, composition, and preview behavior instead of copy changes.

#### Scope Files

- `site/src/app.tsx`
- `site/src/styles.css`
- `site/src/content/en.ts`
- `site/src/content/ja.ts`
- `site/src/app.test.tsx`
- `docs/github-pages-landing-page.md`

#### Trade-offs

- Pro: directly addresses the most visible feedback in one PR.
- Pro: avoids re-tuning hero spacing twice.
- Con: larger PR than copy-only hero cleanup.
- Con: motion and layout regressions are coupled and must be tested together.

#### Code Snippets

```tsx
const HERO_PREVIEW_ROTATE_MS = 3200
const PREVIEW_SCENES = ['slack', 'notes', 'claude'] as const

type PreviewScene = (typeof PREVIEW_SCENES)[number]
```

```tsx
useEffect(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  const intervalId = window.setInterval(() => {
    setPreviewSceneIndex((current) => (current + 1) % PREVIEW_SCENES.length)
  }, HERO_PREVIEW_ROTATE_MS)

  return () => window.clearInterval(intervalId)
}, [])
```

```tsx
const notesFrames = [
  { kind: 'draft', text: 'follow up with design team and summarize blockers' },
  { kind: 'selected', text: 'follow up with design team and summarize blockers' },
  { kind: 'bullets', text: '- Follow up with design team\n- Summarize blockers\n- Share next steps' }
] as const
```

```tsx
const claudePromptFrames = 'In @shape-generator.js can you add a nice morphing transition when I click generate?'.split(' ')
```

```tsx
const claudeWelcomeFrame = [
  '╭─── Claude Code v2.1.12 ───────────────────────────────────────────────╮',
  '│                            Welcome back!                            │',
  '│                                                                      │',
  '│                              ▐▛███▜▌                                 │',
  '│                             ▝▜█████▛▘                                │',
  '│                               ▘▘ ▝▝                                  │',
  '│          Opus 4.5 · Claude Team · Superwhisper                       │',
  '│                                                                      │',
  '│          ~/Dev/kestrel                                               │',
  '╰──────────────────────────────────────────────────────────────────────╯'
] as const
```

### Ticket LP-02 / PR-02

Priority: P0  
Title: Rebuild the entire product-view section in one pass

#### Goal

Replace the current product-view cards with one coherent showcase rebuild that covers all three requested stories in one PR:

- dynamic Markdown-prompt transformation
- reusable profile list
- multiple key-value user-dictionary tables

#### Checklist

- [ ] Replace the current showcase card layout and copy in English and Japanese
- [ ] Dynamically illustrate rough text becoming structured Markdown
- [ ] Lock profile names as demo entries: `Translation`, `Optimize Prompt`, and `Business`
- [ ] Include a visible `+ add profile` affordance
- [ ] Render multiple key-value tables using the requested dictionary pairs
- [ ] Keep all three cards legible and distinct at card size
- [ ] Add tests for card content and requested labels
- [ ] Use `agent-browser` to capture screenshots and inspect showcase UI/style before closing the PR
- [ ] Update landing-page docs for the new product-view structure
- [ ] Keep FAQ wording and usage-section wording unchanged

#### Tasks

1. Rewrite product-view headlines, descriptions, and detail copy in both locales.
2. Replace the transformation card with staged Markdown prompt frames.
3. Replace the profile card with a list model where `Translation`, `Optimize Prompt`, and `Business` are demo profile names, not settings.
4. Show compact traits or detail chips for the selected profile and include `+ add profile`.
5. Replace the dictionary card with multiple grouped tables using `Input` and `Replace with` headers and containing:
   - `clade code -> Claude code`
   - `codex -> Codex`
   - `pull request -> PR`
   - `User A -> Alice`
6. Rebalance card layout and spacing across the full showcase row.
7. Run the local site, use `agent-browser` to capture showcase screenshots, and inspect card spacing, hierarchy, and visual clarity.
8. Verify the FAQ copy and usage-section copy remain unchanged while the surrounding layout still works visually.

#### Gates

- Users can visually understand “messy input” and “structured Markdown output” without reading every line.
- Markdown formatting is obvious: headings, bullets, or fenced sections are visually distinct.
- The profile card clearly reads as a reusable preset list.
- The dictionary card clearly reads as correction mapping, not a generic data table.
- All requested profile names and dictionary pairs are visible.
- Card density remains readable on desktop and mobile widths.
- FAQ wording remains unchanged.
- Usage section wording remains unchanged.
- `agent-browser` screenshots are captured for the product-view section and reviewed for style/UI quality.
- Tests and build pass.

#### Approach

Keep the whole product-view rebuild in one PR because all three cards share the same layout surface, spacing system, and narrative. Use one shared showcase scaffold and three clearly differentiated illustration modules.

#### Scope Files

- `site/src/app.tsx`
- `site/src/styles.css`
- `site/src/content/en.ts`
- `site/src/content/ja.ts`
- `site/src/content/types.ts`
- `site/src/app.test.tsx`
- `docs/github-pages-landing-page.md`

#### Trade-offs

- Pro: avoids repeated churn on the same showcase layout in three sequential PRs.
- Pro: makes visual review easier because the whole section can be judged together.
- Con: bigger PR than card-by-card delivery.
- Con: requires stronger discipline to keep the diff modular inside one PR.

#### Code Snippets

```tsx
const promptFrames = [
  'fix this note and make it usable',
  '# Goal\nRewrite the note clearly',
  '# Goal\nRewrite the note clearly\n\n## Output\n- concise\n- actionable\n- markdown'
] as const
```

```tsx
<pre className="showcase-markdown-frame">
  <code>{promptFrames[currentPromptFrame]}</code>
</pre>
```

### Ticket LP-03 / PR-03

Priority: P1  
Title: Follow-up polish, regression hardening, and docs cleanup

#### Goal

Stabilize the refreshed hero and showcase after the two main PRs land by tightening motion, responsive behavior, docs, and regression coverage.

#### Checklist

- [ ] Review hero and showcase motion for pacing and over-animation
- [ ] Tighten responsive behavior for tablet and mobile
- [ ] Fill any test gaps exposed by implementation PRs
- [ ] Use `agent-browser` screenshots to confirm polish fixes actually improved the UI
- [ ] Refresh docs so the new scene rotation and product-view stories are maintainable

#### Tasks

1. Revisit timing and spacing values after real implementation is visible.
2. Add any missing reduced-motion or layout assertions.
3. Update landing-page docs with finalized maintenance notes.
4. Capture any follow-up limitations explicitly so they do not become hidden debt.
5. Re-run `agent-browser` screenshots after polish changes and compare the updated UI against prior review notes.

#### Gates

- No new layout regressions are visible at common desktop/tablet/mobile widths.
- Motion feels intentional rather than noisy.
- `agent-browser` screenshot review confirms style/UI issues called out in earlier PRs are resolved.
- Tests, typecheck, and site build pass.

#### Approach

Use this as a short stabilization PR only if the first two implementation PRs expose real cleanup work. Do not use it as a dumping ground for deferred core requirements.

#### Scope Files

- `site/src/app.tsx`
- `site/src/styles.css`
- `site/src/content/en.ts`
- `site/src/content/ja.ts`
- `site/src/app.test.tsx`
- `docs/github-pages-landing-page.md`

#### Trade-offs

- Pro: keeps core feature PRs focused while still reserving room for hardening.
- Con: should be skipped if there is no meaningful cleanup, otherwise it becomes artificial ticket splitting.

#### Code Snippets

```tsx
const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
```

```tsx
expect(host.textContent).toContain('Claude code')
expect(host.textContent).toContain('+ add profile')
```

## Cross-Ticket Risks

- Hero animation and product-card animation can compound and make the page feel noisy.
- Apple Notes and Claude Code-inspired visuals must stay evocative without copying product UI too literally.
- More localized mock content increases maintenance cost in `en` and `ja`.
- Multiple preview surfaces can expose layout weaknesses that are not obvious in a single static screenshot.
- High-fidelity mimicry of Apple Notes and Claude Code can drift into uncanny imitation if typography, spacing, and chrome are only approximate.

## Review Criteria For This Plan

### Ticket granularity

- Tickets should be individually reviewable in one PR.
- No ticket should require another unfinished ticket to compile, except by stated dependency order.

### Ticket priority

- P0 tickets address the clearest user pain directly: cramped hero, missing rotating previews, and incomplete product-view storytelling.
- P1 is reserved for stabilization only if it is actually needed.

### Feasibility

- Every ticket stays within existing React/Vite/CSS patterns already used in `site/`.
- No new dependency is required.

### Potential risk

- Animation timing, localization fit, and small-card density are the highest risk areas.

### Proposed approaches

- Prefer data-driven UI helpers over hardcoded one-off blocks.
- Prefer staged motion over complex scripted animation.
- Prefer explicit tests around copy presence, card content, and rotation behavior.
- Prefer `agent-browser` screenshots and UI inspection on every PR instead of relying on code review alone for visual quality.

## Recommended Execution Order

1. LP-01 / PR-01
2. LP-02 / PR-02
3. LP-03 / PR-03 only if stabilization work remains after the first two PRs
