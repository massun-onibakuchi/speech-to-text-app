---
title: Local Profile Routing Criteria and Score Calculation
description: Research findings for selecting a transformation profile locally from frontmost-app context, including reliable signals, scoring rules, thresholds, and fallback behavior.
date: 2026-03-23
status: concluded
tags:
  - routing
  - profiles
  - transformation
  - research
---

# Summary

This document studies how a local router should choose a transformation profile when the app is already configured to output transformed text.

The feature under discussion is narrow:

- it applies only to capture flow
- it applies only when `settings.output.selectedTextSource === 'transformed'`
- it is request-scoped only
- when confidence is low, the router must fall back to `settings.transformation.defaultPresetId`

This document does not propose implementation code. It defines the research conclusions for a reliable local decision model.

# Current Codebase Constraints

The current codebase already establishes the core boundaries:

- `src/main/core/command-router.ts` binds a transformation profile into capture request snapshots and resolves presets for standalone transformation commands
- `src/shared/domain.ts` defines `TransformationPreset` with `id`, `name`, `provider`, `model`, `systemPrompt`, `userPrompt`, and `shortcut`
- `src/main/infrastructure/frontmost-app-focus-client.ts` shows the codebase already has a small macOS-specific utility that can capture the frontmost app bundle id for focus-restore flows

Important consequence:

- context-aware profile selection can be added as a request-scoped override without mutating saved defaults

Important limitation:

- the existing focus client is not yet a general routing-context provider; it only demonstrates that the codebase already interacts with macOS frontmost-app state in a narrow popup-focus use case

Current schema limitation:

- `TransformationPreset` does not contain routing metadata
- `systemPrompt` and `userPrompt` are transformation instructions, not clean routing signals

That means local routing is possible today only by inferring intent from noisy fields, unless the schema gains an explicit routing-oriented field such as `description`

# Problem Definition

The router must answer one question:

> Given the current local context, which transformation preset should be bound for this capture request?

The answer must be conservative. A wrong profile is usually worse than using the default profile.

Therefore the router should optimize for:

- predictability
- debuggability
- low false positives
- safe fallback

It should not optimize for:

- maximum automation at any cost
- fuzzy best-guess behavior with no explanation

# Why App Name Alone Is Not Enough

Frontmost app name can be useful, but it is not sufficient as a general-purpose routing signal.

It works well for strong cases:

- Slack often implies business communication
- VS Code, Cursor, Xcode, IntelliJ often imply coding
- Terminal, iTerm, Warp often imply coding or command-oriented text

It fails for weak or ambiguous cases:

- browser can mean search, docs, GitHub, chat, email, tickets, personal browsing, or web editors
- Notes or Notion can be business writing, personal notes, or technical writing
- chat tools can be work-related or casual

Conclusion:

- app name alone is only reliable for high-signal app families
- a production router must fallback aggressively unless more evidence exists

# Reliable Local Signals

The router should rank local signals by reliability, not treat them equally.

## Tier 1: Stable identity

These signals are the most reliable.

### Bundle identifier

Examples:

- `com.tinyspeck.slackmacgap`
- `com.microsoft.VSCode`
- `com.apple.Terminal`

Why it matters:

- stable
- exact
- not dependent on localization
- easy to compare deterministically

This should be the primary app identity signal.

### Curated app family

Map bundle ids to app families such as:

- `chat`
- `editor`
- `terminal`
- `browser`
- `mail`
- `notes`

Why it matters:

- converts app identity into routing semantics
- keeps logic predictable and testable

## Tier 2: Context within the app

These signals improve reliability for ambiguous apps.

### Window title

Useful examples:

- GitHub PR title in a browser tab
- Google Docs title
- Linear / Jira issue title
- meeting note title

Why it matters:

- browser alone is weak, but browser plus title can be more informative
- editor title can hint at file type or task

Limitations:

- inconsistent formatting across apps
- noisy for generic titles
- may contain private information

### Focused element role or subrole

Examples:

- search field
- text area
- code editor
- terminal-like text view

Why it matters:

- this is the missing signal for cases like "browser search box" versus "browser document editor"
- a browser window with focus in a search field should not be treated the same as a GitHub PR comment box

Limitations:

- requires deeper macOS Accessibility integration
- implementation complexity is higher than frontmost-app detection

## Tier 3: Soft hints

These are supporting signals, not primary ones.

### App display name

Useful as a human-readable fallback, but weaker than bundle id.

### Recent successful routing history

Possible use:

- if the same app repeatedly resolves to the same profile, slightly boost that profile

Limitations:

- can reinforce a past wrong choice
- should never override strong explicit evidence

# Profile-Side Signals

Reliable local routing requires profile metadata that is written for routing.

## Why prompts are a weak routing source

The existing preset schema stores:

- `systemPrompt`
- `userPrompt`

These fields tell the LLM how to transform text. They are not ideal for local routing because:

- they often describe output behavior, not usage context
- they may contain security boilerplate unrelated to intent
- multiple different use cases can share similar prompt wording
- users may optimize prompts for quality, not discoverability

Therefore prompt text should be treated as secondary routing evidence only.

## Why a description field helps

A `description` field can act as routing metadata.

Good examples:

- `Professional rewriting for Slack, email, stakeholder updates, concise business tone`
- `Coding assistant for editors and terminals, preserve technical detail, optimize for commands and code edits`
- `Literal cleanup for dictated text with minimal rewriting`

Bad examples:

- `Good profile`
- `General use`
- `Fast model`

If added, the description should be optimized for:

- intended app contexts
- task intent
- style constraints
- exclusions when relevant

It should not duplicate the full transformation prompt.

# Recommended Local Routing Criteria

The router should score profiles using explicit criteria in descending order of trust.

## Criterion 1: Exact app affinity

Profile description or future metadata explicitly names a specific app or bundle id.

Examples:

- mentions `Slack`
- mentions `VS Code`
- mentions `Terminal`

This is the strongest profile-side signal.

## Criterion 2: App family affinity

The context app belongs to a known family, and the profile description clearly targets that family.

Examples:

- app family `editor` and profile description contains `coding`, `editor`, `code`, `programming`
- app family `chat` and profile description contains `business`, `Slack`, `team chat`, `stakeholder`

## Criterion 3: Window-title affinity

The window title includes evidence that strengthens the fit.

Examples:

- browser title mentions GitHub, PR, issue, docs, email
- editor title contains source file extensions or repo/task names

This should not be enough by itself unless the match is unusually strong.

## Criterion 4: Focus-role affinity

The focused element matches the interaction mode that the profile expects.

Examples:

- search field
- editor
- terminal
- generic text field

This criterion is especially valuable for browsers and document apps.

## Criterion 5: Prompt-derived hints

If no explicit routing metadata exists, infer a small number of tags from:

- profile `name`
- profile `systemPrompt`
- profile `userPrompt`

These inferred tags are weaker and must be scored conservatively.

# Suggested Intent Vocabulary

A small controlled vocabulary is better than unconstrained keyword soup.

Recommended top-level intents:

- `business`
- `coding`
- `translation`
- `cleanup`
- `summary`
- `literal`

Recommended app-family labels:

- `chat`
- `editor`
- `terminal`
- `browser`
- `mail`
- `notes`

Recommended interaction-mode labels:

- `search`
- `compose`
- `edit`
- `command`
- `comment`

The router can map raw signals into these labels and then score profiles against them.

# Score Calculation

The router should not use a single fuzzy keyword count. It should combine weighted evidence.

## Proposed score model

For each candidate profile:

`score = exact_app + app_family + window_title + focus_role + routing_description + prompt_hint + history - conflict_penalty`

Where:

- each positive term contributes evidence
- `conflict_penalty` removes profiles that contradict the observed context
- missing evidence should not be treated as evidence of absence

## Suggested base weights

These values are directional, not final implementation constants.

- exact bundle-id or explicit app mention match: `+60`
- exact app family match: `+30`
- strong window-title match: `+20`
- focused-role match: `+25`
- strong routing-description intent match: `+20`
- prompt-derived intent hint: `+10`
- recent confirmed-use history boost: `+5`
- explicit conflict: `-40`
- major conflict: `-70`

Interpretation:

- exact app matches should dominate
- prompt-derived hints should never beat direct context evidence
- conflict penalties must be strong enough to suppress obviously wrong profiles

## Suggested threshold policy

Do not pick the highest score blindly. Require:

- a minimum score threshold
- a separation margin over the second-best profile

Example policy:

- choose the top profile only if `topScore >= 50`
- and `(topScore - secondScore) >= 15`
- otherwise fallback to default

Why this matters:

- avoids brittle selection in ambiguous contexts
- preserves predictable behavior when profiles overlap

## Example score scenarios

### Slack with a clear business profile

Context:

- bundle id maps to `chat`
- app name: Slack
- no special window-title evidence

Profiles:

- `Business`: description says `Slack, email, stakeholder updates`
- `Coding`: description says `terminal, editor, code`

Possible scoring:

- Business: exact app mention `+60`, app family `+30`, description intent `+20` = `110`
- Coding: conflict penalty `-40`

Decision:

- choose `Business`

### VS Code with a coding profile

Context:

- bundle id maps to `editor`
- window title suggests repo or source file

Possible scoring:

- Coding profile: app family `+30`, title `+20`, description intent `+20` = `70`
- Business profile: no positive evidence

Decision:

- choose coding profile

### Browser with no additional context

Context:

- bundle id maps to `browser`
- no title signal
- no focused-role signal

Possible scoring:

- Business profile: weak match `+5`
- Coding profile: weak match `+5`
- Cleanup profile: weak match `+5`

Decision:

- no candidate passes threshold or margin
- fallback to default

### Browser with focused search field

Context:

- bundle id maps to `browser`
- focused role is `search`

Possible scoring:

- if no profile explicitly targets search-like cleanup or literal behavior, scores stay low
- fallback remains correct

This case shows why browser routing is dangerous without focus metadata.

# Conflict Handling

Routing quality improves as much from good negative evidence as from good positive evidence.

Examples of conflict:

- profile says `for coding editors and terminals`, but context is Slack
- profile says `formal business tone`, but context is terminal
- profile says `literal transcript cleanup only`, but evidence strongly suggests code transformation

Conflicts should not always reject a profile outright, but strong contradictions should apply large penalties.

# Why Fallback Must Win Often

Default fallback is not a failure. It is a safety mechanism.

The router should fallback whenever:

- no profile reaches threshold
- the top two profiles are too close
- context signals are weak or missing
- app family is broad and ambiguous, especially browser
- description quality is too vague to distinguish profiles

If the router is tuned correctly, fallback should happen frequently in low-signal contexts.

# Recommended Behavior for Browsers

Browser should be treated as a weak default context, not a strong routing category.

Local browser routing should only auto-select a profile when at least one additional signal exists:

- focused element role
- window title
- future browser-domain signal
- explicit browser-targeting description in one profile plus a clear score gap

Otherwise:

- fallback to default

This aligns with the intended behavior discussed in discovery:

- browser may not find an optimal profile
- default profile is then used

# Why Local Routing Should Be Deterministic

A deterministic local router has several advantages over fuzzy runtime selection:

- easier to test
- easier to explain to the user
- easier to inspect in logs
- no extra network cost
- no second-model variability

This does not mean the router must be simplistic. It means:

- evidence sources should be explicit
- weights should be versioned
- thresholds should be configurable in code, not hidden inside prompt behavior

# Suggested Evolution Path

The safest path is incremental.

## Phase 1

Use only:

- bundle id
- app family
- optional profile description

This is enough for:

- Slack-like business routing
- editor/terminal coding routing
- safe browser fallback

## Phase 2

Add:

- window title
- conflict tuning
- margin thresholds

This improves ambiguous desktop apps.

## Phase 3

Add:

- focused element role or subrole

This is the first stage where browser behavior can become meaningfully smarter.

## Phase 4

Optionally add:

- recent routing history
- LLM-assisted routing for low-confidence cases only

The local router should remain the baseline even if a model-assisted layer is added later.

# Research Conclusions

1. Local routing is reliable only when it uses explicit, high-signal context such as bundle id and curated app family.
2. App name alone is not reliable enough for broad automatic profile selection.
3. The current preset schema lacks routing metadata; a dedicated `description` field would improve local routing materially.
4. Prompt text is a weak routing signal and should not be the primary local criterion.
5. Score calculation should be weighted, thresholded, and margin-based rather than purely highest-score-wins.
6. Browser contexts should usually fallback unless additional signals exist.
7. Deterministic local routing is the safest baseline, even if a Gemini-assisted router is explored later.

# Open Questions For Later Design Work

- Should profile description be free text only, or later evolve into structured routing metadata?
- Should window-title matching be generic keyword scoring or app-family-specific parsing?
- Should the router log the winning criteria for later debugging?
- Should conflict terms be authorable by users or derived automatically?
- At what confidence threshold should future Gemini routing be allowed to override local routing?

# Practical Recommendation

If the feature proceeds, the research-backed local policy should be:

- route only when transformed output is already selected
- gather local context from bundle id first
- map bundle id to app family
- score profiles primarily from routing-oriented description text
- use prompt text only as weak secondary evidence
- require both threshold and score margin
- fallback to default when uncertain

This yields a router that is conservative by design and less likely to produce surprising profile switches.
