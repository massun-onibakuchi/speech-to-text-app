---
name: ux-design
description: Design and critique user experiences using applied UX psychology (cognitive load, decision fatigue, defaults, anchoring, framing, visual hierarchy, progressive disclosure, trust/motivation effects, and performance perception). Use when the user asks for UX recommendations, UX audits, onboarding/activation improvements, pricing/plan choice architecture, information architecture/navigation, microcopy that changes behavior, or experiment ideas grounded in psychological principles.
---

Design UX changes that are grounded in psychology and still respectful, ethical, and testable.

Use these references when producing recommendations:

- `references/ux-psychology-playbook.md` — source list of principles, effects, and example patterns.
- `references/ux-practical-checklist.md` — implementation-oriented checklist (patterns + pitfalls) to sanity-check your output.

## Output contract

Produce a practical UX recommendation set with this structure:

1) **Goal & context**
   - Primary user job-to-be-done
   - Success metric (what changes if we succeed)
   - Constraints (platform, accessibility, brand, engineering limits)

2) **User decisions & friction map**
   - The 3–7 key decisions the user must make
   - Where users hesitate, abandon, or make mistakes

3) **Recommendations (mapped to psychology)**
   For each recommendation, include:
   - **Principle / effect**
   - **What to change** (UI, flow, copy, defaults, structure)
   - **Why it works** (behavior/perception mechanism)
   - **How to measure** (event(s), metric(s), expected direction)
   - **Risk / trade-off** (ethics, edge cases, accessibility)

4) **Experiment & rollout plan**
   - Smallest test (A/B, holdout, or cohort)
   - Guardrails (quality, regret, support tickets, refunds)
   - Follow-ups if the hypothesis wins/loses

## Workflow

1) Ask for the missing inputs (keep it short):
   - Who is the user? What is the primary task?
   - What is the current funnel step that’s underperforming?
   - Any constraints (compliance, accessibility, branding, tech)?

2) Choose the smallest set of principles that fit the problem:
   - Too many options / complex forms → decision fatigue, cognitive load, defaults, framing
   - Users miss key actions → visual hierarchy, visual anchors, banner blindness
   - Users don’t finish onboarding/tasks → Zeigarnik effect, goal-gradient, progressive disclosure
   - Users don’t trust the product → aesthetic-usability, social proof, endowment/ownership
   - Users complain about “slowness” → Doherty threshold, skeleton screens, labor illusion

3) Propose only changes that can be implemented and verified:
   - Prefer 3–7 high-impact changes over a long list.
   - Keep each change specific enough to build without re-interpretation.
   - Before finalizing, run a quick pass over `references/ux-practical-checklist.md` and call out any important misses (e.g., accessibility, error recovery, reversibility).

## Guardrails (non-negotiable)

- Avoid dark patterns: don’t hide costs, don’t make opt-out punitive, don’t coerce.
- Treat defaults and framing as tools for clarity and sensible presets, not deception.
- If advice impacts sensitive decisions (money, health, legal), recommend extra transparency and user control.
