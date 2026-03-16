---
type: research
status: concluded
question: "What do ADR best practices and templates look like in practice, and how should we choose and apply them correctly?"
review_by: 2026-09-30
tags:
  - adr
  - architecture
  - best-practices
---

# ADR Best Practices and Templates (Research)

## Scope

This research note summarizes how ADR best practices and template mechanics are described across the ADR community ecosystem, with emphasis on:

- What makes an ADR “good” versus “fragile” from selection, writing, and review perspectives.
- How the core workflow (decision-making to enforcement) is structured.
- How major template families (MADR, Nygard, Y-Statement, and others) differ.
- A practical framework for selecting and operating ADR templates in real teams.

## Source corpus

Primary references analyzed:

- ADR website hub pages: home, [AD Practices](https://adr.github.io/ad-practices/), [ADR Templates](https://adr.github.io/adr-templates/), [Decision Capturing Tools](https://adr.github.io/adr-tooling/)
- MADR templates and metadata in `adr/madr` (e.g., [`adr-template.md`](https://raw.githubusercontent.com/adr/madr/main/template/adr-template.md), minimal and bare variants).
- Olaf Zimmermann posts on ADR work methods:
  - [A Definition of Ready for Architectural Decisions](https://www.ozimmer.ch/practices/2023/12/01/ADDefinitionOfReady.html)
  - [A Definition of Done for Architectural Decision Making](https://www.ozimmer.ch/practices/2020/05/22/ADDefinitionOfDone.html)
  - [How to create ADRs — and how not to](https://www.ozimmer.ch/practices/2023/04/03/ADRCreation.html)
  - [How to review ADRs — and how not to](https://www.ozimmer.ch/practices/2023/04/05/ADRReview.html)
  - [Architectural Significance Test](https://www.ozimmer.ch/practices/2020/09/24/ASRTestECSADecisions.html)
- Michael Nygard’s original structure in [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

## Core ADR model (working from first principles)

ADR methods in this ecosystem treat ADRs as the record of one architectural decision, not a complete architecture document. The consistent model is:

- **Decision before ADR**: ADR logging captures outcome and rationale, not necessarily exhaustive design detail.
- **Decision lifecycle** is iterative: identify issue/options, evaluate, decide, capture, and enforce/realize.
- **Rationale-driven records** are the point: future contributors need context, not just the final choice.
- **Lightweight format by default**: short, modular records are favored over large static documents.

From the ADR template page, the ecosystem framing is:

- ADR is a justified, architecturally significant choice with measurable architectural quality impact.
- ADR collection forms a decision log.

## Best-practice baseline: when and what to capture

### 1) Do not treat every design decision as ADR

The ADR readiness guidance emphasizes selecting *important and urgent* decisions for ADR treatment:

- Use ADRs for architecturally significant and hard-to-reverse choices.
- Defer low-impact, easy-to-reverse defaults and transactional changes.

### 2) Decision Readiness (Definition of Ready)

A decision is “ready” when five conditions are in place:

1. **Stakeholders are known** and can participate (RACI-like clarity).
2. **Right timing**: the “most responsible moment” has arrived.
3. **Context, requirements, criteria are understood**.
4. **At least two viable options exist** and trade-offs are (or can be) understood.
5. **An ADR template/log format is selected and instantiated** so recording can begin immediately.

This is often summarized by the acronym-like **START** gate in ADR literature.

Additional nuance from significance testing:

- Prioritize by business value/risk, dependencies, cost/effort, cross-cutting impacts, novelty, and historical problem/defect risk.
- Use lightweight scoring/checklists, but do not over-optimize quantification; treat it as qualitative support.

### 3) Decision completion (Definition of Done)

The DoD model uses five criteria (`E`, `C`, `A`, `D`, `R`):

1. **Evidence**: confidence that the chosen option works and does not break existing decisions; typically via PoC/spike, backlog experiment, or trusted expert review.
2. **Criteria**: at least two alternatives evaluated against explicit decision drivers.
3. **Agreement**: alignment among decision makers/peers with no unresolved blockers.
4. **Documentation**: decision recorded in a lightweight, shared template and published.
5. **Review/Realization plan**: explicit timing and plan to execute, review, and possibly revise/revisit.

Decision becomes actionable only when evidence plus enforcement/review plan exist.

## How good ADRs work (creation layer)

The “How to create ADRs” guidance repeatedly frames ADRs as simultaneously:

- **Executive summary** (problem, choice, rationale, consequences)
- **Verdict/scale** (comparison of trade-offs, not just preference)
- **Action plan** (decision must be executable)
- **Contract** (once agreed, enforcement and traceability matter)

### Core creation practices (operational summary)

1. **Prioritize by architectural significance** and urgency.
2. **Avoid overdeferred high-impact decisions** where reversal cost is high.
3. **Weigh meta-qualities early** (observability, maintainability, ability to react) to avoid lock-in.
4. **Be evidence-based** (not vendor-bashy, not emotional, explicit reasoning).
5. **Use disciplined editorial quality** (clarity, no rushed prose, appropriate length).
6. **Split hard decisions into stages** when needed (short-term, mid-term, long-term rationale).
7. **State confidence** and disclose uncertainty/caveats.

### Anti-patterns to avoid when creating ADRs

Common issues observed:

- One-sided justification (“pros only”) and rhetorical/marketing tone.
- Fake alternatives (“pseudo” options) to satisfy template shape.
- Tunnel vision that ignores ops/support/maintenance stakeholders.
- Mega-ADR style (architecture master inside ADR) and blueprint-policy dilution.
- Context fabrication (false urgency) or problem-solution mismatch.
- Overly heavy formatting and non-actionable prose.

Practical remediation is explicit in the guidance: stay focused, keep ADR scope to a decision-level granularity, keep evidence traceable, and keep language precise/neutral.

### Socialization requirement

A completed ADR is not “done” socially until it is discussed and acknowledged by affected stakeholders. ADR creation is an internal contract plus external communication activity.

## Review layer (quality gate)

The review model proposes three reviewer perspectives:

- peer / internal reviewer
- stakeholder reviewer
- external authority reviewer

The ADR-specific review checklist asks whether:

1. The problem merits ADR.
2. Options are complete and plausible.
3. Criteria are complete and coherent.
4. Criteria conflicts are prioritized.
5. Chosen option is justified.
6. Consequences (good and bad) are reported objectively.
7. ADR is actionable with traceable requirements and a validity/review date.

Repeatable review reduces process drift and makes revision thresholds explicit.

## Template families and mechanics

### A) MADR (Markdown Architectural Decision Record)

Mainstream template used in the ADR ecosystem; supported by tooling and minimal syntax.

#### Full MADR structure (current `main`)

- Optional metadata: status/date/decision-makers/consulted/informed
- Context and Problem Statement
- Decision Drivers (forces/criteria)
- Considered Options
- Decision Outcome
- Consequences (Good/Bad)
- Confirmation/Validation (optional)
- Pros and Cons per option
- More Information

#### MADR variants in practice

- **Full annotated** (`template/adr-template.md`) with inline instructions.
- **Minimal** (`template/adr-template-minimal.md`) with core sections.
- **Bare** variants (empty structure for tooling generation).
- Some references describe four base formats (full/bare + minimal/bare minimal).

### B) Nygard format (from the 2011 proposal)

Classical lightweight structure:

- Status
- Context
- Decision
- Consequences

Characteristics:

- Emphasis on numbering and monotonic evolution.
- Explicit preservation of superseded/reversed decisions.
- Keep ADRs short and conversational for future maintainers.

### C) Y-Statement

Template shape:

- Context/use case and concern.
- Decision option chosen.
- Target quality consequence.
- Accepted downside.

Extended form adds:

- Other options considered.
- Explicit rationale.

Useful for very short, slide-scale ADRs where overhead must be minimal.

### D) Other/standards

- ISO/IEC/IEEE 42010 approach contributes a more formal architecture-information perspective (e.g., information items and decision-identification categories).
- Additional ADR format ecosystems are maintained in community repositories.
- Choice is less about superiority and more about team constraints (governance, traceability, external review obligations).

## Practical template selection framework

Treat template selection as a cost/benefit and lifecycle problem:

- **Choose full MADR when** you need explicit criteria trade-off and want better reviewability across teams.
- **Choose minimal MADR / Y-Statement when** speed, lightweight authoring, and audience readability dominate.
- **Choose Nygard when** you need very low ceremony and a deeply familiar, minimal canonical structure.
- **Choose fuller standard/template ecosystems when** compliance, reuse, and external auditability are important.

Selection checklist for teams:

1. ADR significance classes in use (high-risk only vs broad use).
2. Decision volume and team size.
3. Required review rigor.
4. Tooling availability (VCS-only vs ADR managers vs enterprise platforms).
5. Language consistency across repos/orgs (mandatory for reuse/search).

## How templates “work” together with AD workflow

A practical operating loop:

1. **Ready gate (START-like DoR)** before authoring begins.
2. **Author** using one canonical template.
3. **Review** via checklist before status transitions.
4. **Log** with status and metadata for traceability.
5. **Confirm/validate** post-implementation (`Validation/Confirmation`, ADR status transitions).
6. **Review date/revision trigger** to avoid stale decisions.

Common lifecycle fields should be explicit:

- Decision makers / consulted / informed.
- Criteria and rejected alternatives.
- Good and bad consequences, not just upside.
- Realization date / review date.
- Status transitions (`proposed`, `accepted`, `deprecated`, `superseded` or equivalent).

## Tooling implications

The community list of ADR tooling spans three classes:

- General template tooling (CLI, script-based pipelines).
- MADR-specific tools (CLI, VS Code, web UIs, search plugins).
- Nygard tooling (shell scripts, multi-language ports, renderers).

Tooling choice affects governance quality mostly through:

- Template consistency enforcement.
- Optional metadata discipline.
- Status lifecycle workflows.
- Discoverability/reuse/search across logs.

## Risks and operating traps

- **Template drift**: teams mixing templates midstream creates ambiguous archives.
- **Status ambiguity**: lack of explicit lifecycle statuses creates “accepted-but-unreviewed” ADR debt.
- **Over-documentation**: turning ADR into architecture encyclopaedia dilutes utility.
- **Under-documentation**: skipping consequences and alternatives converts ADR into policy decisions without rationale.
- **Tool overfitting**: forcing complex tooling on early-stage teams creates resistance.

## Suggested baseline operating policy (starter standard)

For first pass in most teams:

1. Use **one primary template** (MADR full or minimal) for all hard decisions.
2. Keep light ADRs for tiny decisions only if approved by the team.
3. Enforce `E/C/A/D/R` gates before status changes.
4. Include at least two alternatives and explicit criteria for every “accepted” ADR.
5. Add one review date for each ADR at creation.
6. Review ADRs regularly for superseded/realized/revised status.

## Open questions

- Which teams should enforce strict tool-backed schemas vs manual markdown governance?
- When should lightweight Y-statements be allowed for long-lived decisions?
- How much metadata is enough for search/reuse without increasing authoring friction?
- What is the trigger cadence for reevaluation of legacy ADRs in your context?
