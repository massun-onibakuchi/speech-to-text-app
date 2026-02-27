<!--
Where: docs/style-update-execution-plan.md
What: Ticketized UI/UX redesign execution plan from docs/style-update.md.
Why: Deliver a full style reset in small, reviewable, one-ticket-per-PR steps with explicit gates.
-->

# Style Update Execution Plan

## Plan Rules
- One ticket equals one PR.
- No mixed legacy/new visual patterns in the same surface once a ticket is merged.
- Keep business behavior and data flow unchanged unless `docs/style-update.md` explicitly requires UI interaction changes.
- Every ticket must add at least one test and update docs for any user-visible change.
- Every ticket PR must include a short rollback procedure (revert steps + post-revert validation).
- Priority order is strict: finish all P0 tickets before P1, then P2.

## Ticket Index (Sorted by Priority)

| Priority | Ticket | PR Scope | Depends On |
|---|---|---|---|
| P0 | STY-00 Build tooling and dependency preflight | Tailwind v4 stack, icon/font deps, UI infra setup only | None |
| P0 | STY-01 Token foundation and global dark base | CSS token system + base layer + forbidden animation removal | STY-00 |
| P0 | STY-02 App shell re-architecture and tab/component stubs | Layout shell + routing model + placeholder component slots | STY-01 |
| P0 | STY-03 Recording controls and waveform strip redesign | Left panel recording interaction only | STY-02 |
| P1 | STY-04 Activity feed component and card/status redesign | Activity tab UI only | STY-02 |
| P1 | STY-05 Profiles panel component and inline-edit redesign | Profiles tab UI only | STY-02 |
| P1 | STY-06a Settings IA reorder | Settings section order only | STY-02 |
| P1 | STY-06b Settings control-pattern redesign | Settings control visuals/interactions only | STY-06a |
| P1 | STY-07 Status bar and toast visual migration | Footer + toast visuals only | STY-02 |
| P2 | STY-08 Legacy style removal and utility-only cleanup | Remove dead CSS/classes/tokens only | STY-01..STY-07 |
| P2 | STY-09 E2E hardening, accessibility audit, docs finalization | End-to-end verification and documentation only | STY-01..STY-08 |

---

## STY-00 [P0] Build Tooling and Dependency Preflight

### Goal
Install and wire required style dependencies so downstream tickets are implementable and build-safe.

### Checklist
- [ ] Tailwind v4 dependency stack installed.
- [ ] Vite config includes Tailwind v4 plugin wiring.
- [ ] `tw-animate-css` installed and import-ready.
- [ ] `lucide-react` installed and available.
- [ ] Font loading strategy selected for desktop offline behavior (package-based, not CDN).
- [ ] `shadcn/ui` baseline setup decided and documented (manual components or generator-based seed).
- [ ] Font package names verified against npm registry before install commands are finalized.

### Tasks
1. Verify package names with `npm info` (especially Geist Mono source package), then add dependencies: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `lucide-react`, `@fontsource/inter`, and validated Geist Mono package (or approved local equivalent).
2. Update Vite renderer config to include Tailwind v4 plugin.
3. Wire font package imports in renderer entry/global style path.
4. Decide and document shadcn/ui setup approach in `docs/decisions/` (generator-based seed vs manual component wiring) before component tickets begin.
5. Establish `cn()` helper path or validate existing utility helper compatibility.
6. Add a concrete smoke check: run `pnpm run build`, then grep built renderer CSS in `out/renderer` for representative utilities (`.bg-background`, `.text-foreground`, `.border-border`).
7. Update docs with tooling prerequisites and exact dependency versions.

### Gates
- Scope gate: infra/setup only; no component restyling in this PR.
- Feasibility gate: `pnpm install`, renderer build, and `pnpm run test` pass.
- Feasibility gate: shadcn/ui setup decision and `cn()` helper path are finalized before merge.
- Risk gate: no network/CDN runtime dependency for required fonts.

---

## STY-01 [P0] Token Foundation and Global Dark Base

### Goal
Replace global renderer style foundation with the new dark-only OKLCH token system and Tailwind base methodology.

### Checklist
- [ ] `src/renderer/styles.css` rewritten to Tailwind v4 + `tw-animate-css` structure.
- [ ] `@custom-variant dark (&:is(.dark *))` present.
- [ ] Full semantic OKLCH token set from spec applied to `:root` and `.dark`.
- [ ] `@theme inline` maps tokens to utilities.
- [ ] Base layer applies `border-border outline-ring/50` globally and `bg-background text-foreground` on body.
- [ ] Body uses `font-sans antialiased`; HTML uses hardcoded `.dark` class.
- [ ] Forbidden global animations (`[data-stagger]`, `translateY` entrance effects) removed.

### Tasks
1. Replace legacy token declarations with spec token set.
2. Add `@theme inline` mappings and validate semantic utility classes compile.
3. Apply base-layer defaults and typography defaults.
4. Remove legacy global animation blocks that violate section 7 constraints.
5. Add tests/smoke checks for dark class + representative token utility rendering.
6. Update docs with new token/source-of-truth notes.

### Gates
- Scope gate: foundation styles only; no per-feature component redesign.
- Feasibility gate: renderer build emits Tailwind classes successfully.
- Risk gate: zero references remain to legacy tokens (`--bg`, `--ink`, etc.).

---

## STY-02 [P0] App Shell Re-Architecture and Tab/Component Stubs

### Goal
Implement the new fixed desktop shell architecture and establish component placeholders required for subsequent tab-specific redesign tickets.

### Checklist
- [ ] Root shell is `flex h-screen flex-col bg-background` with fixed header/main/footer.
- [ ] Main split uses fixed `w-[320px]` left panel + flexible right workspace.
- [ ] Header structure matches spec with status dot treatment.
- [ ] Tab rail uses flat underline style (`Activity`, `Profiles`, `Settings`).
- [ ] Page-level scroll is removed; content panes own their own scrolling.
- [ ] Placeholder components exist for activity/profiles/status surfaces to unblock scoped PRs.
- [ ] Legacy `home/settings` navigation model is removed cleanly from renderer UI state.

### Tasks
1. Refactor shell layout hierarchy to section 5 architecture.
2. Introduce a strictly UI-local tab state model (`activity`/`profiles`/`settings`) and keep existing business state/event flows unchanged.
3. Implement header and rail markup/classes exactly per spec.
4. Replace old `home/settings` UI navigation wiring in `src/renderer/renderer-app.tsx` and `src/renderer/shell-chrome-react.tsx` with tabbed workspace routing.
5. Create explicit placeholder components for tab surfaces:
   - `src/renderer/activity-feed-react.tsx`
   - `src/renderer/profiles-panel-react.tsx`
   - `src/renderer/status-bar-react.tsx`
6. Ensure footer remains visible while content pane scrolls.
7. Add layout tests using deterministic class/state assertions (for example: `h-screen`, `w-[320px]`, persistent header/footer mount), and defer geometry verification to e2e in STY-09.
8. Update docs for shell structure and scroll ownership.

### Gates
- Scope gate: shell/routing/layout and stubs only; no tab card details.
- Feasibility gate: app startup and navigation interactions remain functional.
- Feasibility gate: tab-state refactor does not alter data/service ownership or IPC contracts.
- Risk gate: desktop viewport has no page-level vertical scroll regression.

---

## STY-03 [P0] Recording Controls and Waveform Strip Redesign

### Goal
Implement recording button state visuals (`idle`, `recording`, `processing`) and waveform strip behavior from the spec without changing recording logic.

### Checklist
- [ ] Circular `size-20` target and focus-visible ring preserved.
- [ ] State-specific icon/color/label/disabled visuals match spec.
- [ ] Recording animation rings render only during recording.
- [ ] Cancel affordance with `X` icon and required hover/focus behavior implemented.
- [ ] Waveform strip renders 32 bars with idle sine and recording dynamic visuals.
- [ ] ARIA labels exist for start/stop/cancel actions.

### Tasks
1. Restyle recording button component for all three states.
2. Implement recording-only ring layers and allowed animation classes.
3. Rework waveform rendering for idle and recording states.
4. Validate keyboard, focus, and aria-label coverage for controls.
5. Add unit/component tests for class/state transitions and ARIA labels (class/state assertions in component tests; visual timing checks in e2e STY-09).
6. Update docs for recording and waveform visual contract.

### Gates
- Scope gate: recording panel and waveform only.
- Feasibility gate: existing recording events/state transitions still function.
- Risk gate: no disallowed animation patterns introduced.

---

## STY-04 [P1] Activity Feed Component and Card/Status Redesign

### Goal
Define the activity feed data contract and implement the activity feed React surface with the specified card/status design once required fields are available.

### Checklist
- [ ] Activity surface is a dedicated renderable component in tab workspace.
- [ ] Required data contract for spec-compliant activity cards is documented (status, transcript, transformed text, timestamp, duration, optional profile).
- [ ] Card spacing, radius, border, and typography match spec.
- [ ] Status icon/badge and semantic border mapping are correct.
- [ ] Transcript and transformed text blocks follow required visual hierarchy.
- [ ] Hover-reveal actions use opacity transition and keep keyboard access.
- [ ] Empty state visuals/copy align with spec.

### Tasks
1. Audit current activity data shape in renderer/main boundaries and map gaps against spec-required card fields.
2. If gaps exist, create a decision note in `docs/decisions/` defining minimal contract evolution and expected IPC/business-impact boundary.
3. Implement/expand activity component from placeholder.
4. Restyle card list container with required scroll/spacing behavior.
5. Implement status row visuals with semantic border mapping.
6. Restyle transcript/transformed text sections with clamp and backgrounds.
7. Add hover-reveal action styling and accessibility checks.
8. Add tests for status classes, empty state rendering, and contract fallback behavior when optional fields are missing.
9. Update docs/screenshots for activity tab.

### Gates
- Scope gate: activity tab only.
- Feasibility gate: existing job state data renders correctly across statuses.
- Feasibility gate: any required activity data-contract change is explicitly approved and isolated to minimal required fields.
- Risk gate: status messaging always includes icon + text, not color-only cues.

---

## STY-05 [P1] Profiles Panel Component and Inline-Edit Redesign

### Goal
Create the profiles panel React surface (if absent) and implement compact profile cards and inline edit interactions.

### Checklist
- [ ] Profiles surface is a dedicated component in tab workspace.
- [ ] Active/default card states match spec colors/badges.
- [ ] Hover actions (default/edit/delete) reveal as specified.
- [ ] Inline edit form uses required field heights, spacing, and mono metadata usage.
- [ ] Save/Cancel/Add controls use compact variants and sizing.
- [ ] Interactive cards support keyboard activation contract.

### Tasks
1. Implement/expand profiles component from placeholder.
2. Restyle profile cards and active/default indicators.
3. Build inline edit form layout (`grid-cols-2`, `h-7`, `space-y-*`).
4. Add keyboard accessibility behavior (`role`, `tabIndex`, Enter/Space handlers).
5. Ensure icon-only controls have aria-labels and focus-visible treatment.
6. Add tests for card states and keyboard activation.
7. Update docs for profiles panel interaction behavior.

### Gates
- Scope gate: profiles tab only.
- Feasibility gate: existing create/edit/delete/default handlers remain unchanged.
- Risk gate: inline edit remains in-panel and does not regress to navigation flow.

---

## STY-06a [P1] Settings IA Reorder

### Goal
Reorder settings sections to the exact spec sequence with required separators and section headers, without changing control patterns yet.

### Checklist
- [ ] Section order is: Output, Speech-to-Text, LLM Transformation, Audio Input, Global Shortcuts.
- [ ] Separator placement and section heading style match spec.
- [ ] Existing controls remain functionally equivalent after reorder.

### Tasks
1. Reorder settings sections/render sequence to required IA.
2. Apply section heading icon + typography pattern.
3. Verify section separators and spacing match spec.
4. Add test asserting rendered section order.
5. Update docs with new settings information architecture.

### Gates
- Scope gate: IA ordering and headers only.
- Feasibility gate: settings persistence/validation still passes existing tests.
- Risk gate: no control behavior changes introduced in this ticket.

---

## STY-06b [P1] Settings Control-Pattern Redesign

### Goal
Apply custom Output control patterns, compact API key field treatment, and shortcut row styling after IA order is stabilized.

### Checklist
- [ ] Output source selector uses custom exclusive radio cards.
- [ ] Destination toggles use independent checkbox-card rows with switch.
- [ ] Warning message appears when both destinations are disabled.
- [ ] API key fields use mono compact styling and eye-toggle treatment.
- [ ] Shortcut rows render key combos with `<Kbd>` components.

### Tasks
1. Replace Output source controls with custom radio-card implementation.
2. Replace destination toggles with custom checkbox-card pattern.
3. Implement both-disabled warning style/visibility behavior.
4. Restyle API key inputs and visibility toggles.
5. Restyle shortcut rows with `<Kbd>` segments and compact metadata typography.
6. Add tests for output-control state visuals and warning visibility.
7. Update docs for settings control rules.

### Gates
- Scope gate: settings controls visuals/interactions only.
- Feasibility gate: persisted values and validation semantics remain unchanged.
- Risk gate: warning condition for disabled destinations is tested and enforced.

---

## STY-07 [P1] Status Bar and Toast Visual Migration

### Goal
Implement the compact status bar strip and migrate toast visuals to the new token/utility system so legacy toast classes can be removed safely.

### Checklist
- [ ] Footer structure/spacing/border/translucency matches spec.
- [ ] Left cluster shows STT provider/model, LLM provider, and audio device with compact mono typography.
- [ ] Right cluster shows active profile and connectivity icon+text pairing.
- [ ] Toast layer/items no longer rely on legacy tokens/classes.
- [ ] Connectivity and toast statuses remain readable without color-only signaling.

### Tasks
1. Restyle status bar layout and metadata clusters to spec.
2. Ensure required mono metadata typography and icon sizing.
3. Wire online/offline visual states to existing readiness signal.
4. Migrate `toast-layer`/`toast-item` styling to new token utilities.
5. Validate metadata overflow/truncation handling.
6. Add tests for online/offline icon+text and toast visual rendering.
7. Update docs for footer and toast style contracts.

### Gates
- Scope gate: footer and toast visuals only.
- Feasibility gate: status/notification data sources unchanged.
- Risk gate: footer/toast remain functional after legacy class cleanup.

---

## STY-08 [P2] Legacy Style Removal and Utility-Only Cleanup

### Goal
Remove all legacy style patterns listed in section 9 so the renderer style system is fully migrated.

### Checklist
- [ ] Legacy classes (`.shell`, `.card`, `.hero`, `.nav-tab`, `.toast-item`, etc.) are removed from active renderer paths.
- [ ] Legacy tokens, gradients, shadows, serif headings, pill-tab styles, and breakpoint logic are deleted.
- [ ] No remaining references to old naming conventions or token variables.

### Tasks
1. Search and remove remaining legacy class usages from renderer files.
2. Delete obsolete CSS blocks from `src/renderer/styles.css`.
3. Verify no stale selectors/tokens remain with repo-wide grep checks.
4. Run style/build/test checks and fix unresolved references.
5. Add regression assertion that new utility classes are applied in key surfaces.
6. Update docs with migration-complete checklist.

### Gates
- Scope gate: cleanup only; no net-new UI features.
- Feasibility gate: renderer compiles and tests pass with legacy selectors removed.
- Risk gate: only dead/fully migrated selectors are deleted.

---

## STY-09 [P2] E2E Hardening, Accessibility Audit, Docs Finalization

### Goal
Close the redesign with integration-level verification, accessibility audit coverage, and final implementation documentation.

### Checklist
- [ ] E2E matrix covers shell layout, per-tab scroll isolation, recording states, settings order/controls, status bar, and toast visuals.
- [ ] Accessibility audit validates keyboard focus rings, icon-only ARIA labels, and interactive card keyboard behavior.
- [ ] Manual QA checklist includes regression, smoke, and rollback steps.
- [ ] Final docs map delivered behavior to tickets STY-00..STY-08.

### Tasks
1. Build consolidated e2e verification matrix mapped to sections 3-11 of spec.
2. Add/expand e2e tests for tab behaviors and major redesign interactions.
3. Run full verification (`pnpm run test`, `pnpm run test:e2e`) and resolve failures.
4. Finalize docs with ticket completion traceability and non-goals.

### Gates
- Scope gate: validation, audit, and docs only.
- Feasibility gate: all automated suites pass on the branch.
- Risk gate: unresolved a11y or behavioral regressions block completion.

---

## Cross-Ticket Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Missing infra prerequisites causes early ticket failures | High | Enforce STY-00 completion before any style implementation PR starts. |
| Tailwind v4 ecosystem/tooling incompatibilities | Medium | Validate plugin compatibility in STY-00 and pin working versions before downstream UI tickets. |
| Shell re-architecture scope expands unexpectedly | High | Keep STY-02 limited to layout/routing/stubs; move visual detail to downstream tickets. |
| Legacy styles survive in hidden surfaces (toast/footer) | Medium | Assign explicit migration ownership in STY-07 and cleanup validation in STY-08. |
| Accessibility regressions from compact control density | High | Require per-ticket a11y assertions and final STY-09 audit gating. |
| Visual changes accidentally alter behavior contracts | High | Keep each PR scoped to presentation; include regression tests around existing handlers/state transitions. |

## Definition of Done (Applies to Every Ticket)
- [ ] PR scope maps to exactly one ticket in this plan.
- [ ] Ticket checklist is complete.
- [ ] Ticket gates are validated explicitly in PR description.
- [ ] At least one test added/updated and passing.
- [ ] Relevant docs updated.
- [ ] PR includes rollback procedure and post-revert validation notes.
