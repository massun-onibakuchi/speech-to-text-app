---
title: ADR writing and management best practices
description: Summarize established best practices for writing, reviewing, organizing, and maintaining ADRs over time.
date: 2026-03-16
status: concluded
review_by: 2026-09-30
tags:
  - adr
  - architecture
  - decision-records
  - documentation
  - research
---

# ADR Writing and Management Best Practices

## Scope

This research document studies established ADR practice guidance with emphasis on:

- what an ADR should contain
- how ADRs should be written so they stay useful
- how ADRs should be reviewed and maintained
- how ADR logs should be organized over time
- what should happen when a decision changes

The question behind this note is not only how to write a single good ADR, but how to run an ADR log as a durable decision system.

## Source corpus

Primary and near-primary sources reviewed:

- Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- ADR GitHub organization:
  - [Architectural Decision Records home](https://adr.github.io/)
  - [AD Practices](https://adr.github.io/ad-practices/)
  - [ADR Templates](https://adr.github.io/adr-templates/)
- MADR:
  - [About MADR](https://adr.github.io/madr/)
  - [MADR template](https://github.com/adr/madr/blob/develop/template/adr-template.md)
  - [ADR-0008 Add Status Field](https://adr.github.io/madr/decisions/0008-add-status-field.html)
  - [ADR-0009 Support Links To Other ADRs Inside an ADR](https://adr.github.io/madr/decisions/0009-support-links-between-adrs-inside-an-adrs.html)
  - [ADR-0013 Use YAML front matter for metadata](https://adr.github.io/madr/decisions/0013-use-yaml-front-matter-for-meta-data.html)
- Olaf Zimmermann practice notes:
  - [How to create Architectural Decision Records (ADRs) — and how not to](https://www.ozimmer.ch/practices/2023/04/03/ADRCreation.html)
  - [How to review Architectural Decision Records (ADRs) — and how not to](https://www.ozimmer.ch/practices/2023/04/05/ADRReview.html)
  - [A Definition of Done for Architectural Decision Making](https://www.ozimmer.ch/practices/2020/05/22/ADDefinitionOfDone.html)
  - [A Definition of Ready for Architectural Decisions](https://www.ozimmer.ch/practices/2023/12/01/ADDefinitionOfReady.html)

## Executive summary

The most stable cross-source conclusions are:

1. ADRs should capture one architecturally significant decision at a time, together with context, alternatives, rationale, status, and consequences.
2. ADRs should be short, decision-centered, and written for future readers who need to understand why a choice was made.
3. ADR logs should be append-mostly and traceable. When a decision changes, the old ADR should normally remain in place and be marked `superseded` or `deprecated`, rather than removed.
4. ADR quality depends as much on process as on template: timing, review, evidence, stakeholder agreement, and follow-through matter.
5. Template choice is secondary to discipline. Nygard, MADR, and Y-Statement can all work, but richer templates are better when trade-offs and long-term maintenance need to be explicit.

The user’s example, "don't remove it; the tag should be updated to superseded instead", aligns with the strongest baseline in the source set. Nygard explicitly recommends keeping reversed decisions and marking them superseded. MADR also bakes status and ADR-to-ADR linkage into the model. I therefore infer that "keep and supersede" is the best default for durable ADR logs unless the artifact is not really an ADR or was created in error.

## What ADRs are for

Across the source set, ADRs exist to solve one recurring problem: teams often remember what was built, but not why it was built that way.

Nygard’s original argument is still the clearest:

- large architecture documents tend not to stay current
- small, modular records are easier to read and update
- without rationale, future contributors either accept old decisions blindly or reverse them blindly

This produces the core ADR value proposition:

- capture rationale close to the code and architecture
- preserve decision context across team turnover
- reduce repeated debate on already-settled issues
- make later revision possible because the earlier assumptions are visible

ADR collections are therefore both documentation and decision memory.

## What should qualify as an ADR

Not every technical choice deserves an ADR.

Nygard centers ADRs on "architecturally significant" decisions affecting structure, non-functional characteristics, dependencies, interfaces, or construction techniques. Zimmermann adds prioritization guidance:

- use ADRs for high-impact, high-cost, hard-to-reverse choices
- prefer ADRs for decisions with significant consequences in risk, cost, or architecture evolution
- avoid spending ADR effort on trivial or easily reversible local defaults

Good ADR candidates usually have one or more of these properties:

- expensive to reverse
- cross-cutting across teams or subsystems
- materially affects quality attributes such as operability, scalability, security, maintainability, portability, or evolvability
- depends on trade-offs between real alternatives
- likely to be revisited later, so preserved rationale will matter

Poor ADR candidates are usually:

- obvious implementation details
- one-off local refactor decisions with no lasting architectural effect
- records that are really meeting notes, task plans, or status reports

## Timing: when to write ADRs

The sources argue against both late capture and premature certainty.

Zimmermann’s Definition of Ready proposes five entry conditions before making and capturing an architectural decision:

- stakeholders are known
- the most responsible moment has arrived
- alternatives exist
- requirements, criteria, and context are understood
- the ADR template/log entry is ready

This leads to a practical timing rule:

- do not wait until the decision has faded into folklore
- do not write ADRs so early that there is no real problem statement, no real options, or no real evidence

Best practice is to start the ADR while the decision is being made and finalize it when the decision reaches agreement.

## The minimum useful ADR content

Nygard’s original structure is minimal:

- title
- status
- context
- decision
- consequences

This remains a strong baseline because it forces discipline without much overhead.

MADR extends this with explicit support for richer reasoning:

- decision drivers
- considered options
- decision outcome
- consequences
- confirmation
- pros and cons of each option
- more information

The ADR templates page explains the practical difference:

- Nygard ADRs are concise and minimal
- MADR emphasizes trade-off analysis and richer metadata
- Y-Statement is ultra-compact and good when brevity matters most

The common denominator is not the exact headings but the information model. A durable ADR needs:

1. The problem and forces.
2. The real options that were considered.
3. The chosen option.
4. Why that option won.
5. What trade-offs and consequences follow.
6. What status the decision currently has.

If any of those are missing, the ADR becomes much less useful over time.

## Writing best practices

### 1. One decision per ADR

This is foundational. One ADR should capture one significant decision, not an entire architecture slice. Nygard explicitly treats one ADR as one significant decision. Zimmermann warns against turning ADRs into epics or "everything is an ADR" documents.

Why this matters:

- smaller units are easier to review
- later supersession is cleaner
- dependencies between decisions stay visible
- readers can find the relevant rationale quickly

### 2. Write for future readers

Nygard recommends writing each ADR as a conversation with a future developer. This is one of the most durable pieces of advice in the ADR literature.

Practical implications:

- explain the problem before the answer
- define domain or technology assumptions that may not be obvious later
- avoid team-local shorthand when it obscures reasoning
- explain why alternatives were rejected, not only why the winner looks attractive

### 3. Keep ADRs short, but not shallow

Nygard recommends one or two pages. Zimmermann describes ADRs as executive summaries that distill the essential decision information.

This does not mean "brief at all costs." It means:

- do not bloat the ADR with implementation trivia
- do not omit crucial trade-offs
- keep detail proportional to the decision’s significance

Good ADR brevity removes noise, not rationale.

### 4. State trade-offs explicitly

This is one of the strongest themes in modern ADR guidance.

MADR explicitly values considered options with pros and cons. Zimmermann’s creation guidance stresses that ADRs are a "verdict or scale": the chosen option brings benefits at a price, and neglected options should be evaluated too.

Best practice:

- include at least two realistic alternatives whenever possible
- include negative consequences of the chosen option
- avoid only-pros narratives
- make criteria conflicts visible

An ADR that does not show trade-offs often reads like advocacy, not reasoning.

### 5. Anchor rationale in requirements and evidence

Zimmermann argues that decisions should be rooted in actual requirements and experience, and DoD guidance adds evidence as a completion criterion.

Good ADRs therefore connect the decision to:

- quality attributes
- stakeholder concerns
- experiments, proofs of concept, benchmarks, spikes, or operational evidence
- previous ADRs and known constraints

Best practice is not to paste all raw data into the ADR. Link supporting evidence and summarize the relevant conclusion.

### 6. Use assertive, precise language

The decision should sound binding once agreed. Nygard uses active voice: "We will …". Zimmermann also recommends assertive, objective language and warns against subjective or promotional phrasing.

Avoid:

- marketing language
- unsupported superlatives
- vague verbs such as "consider", "explore", or "maybe" in the final decision statement
- loophole wording that lets readers reinterpret the decision later

### 7. Record consequences, not just benefits

Nygard says consequences should include all resulting effects, not just positive ones. MADR’s templates also make "Good" and "Bad" explicit.

This is central to ADR usefulness because future teams often need to know:

- what pain was accepted knowingly
- what new obligations the decision creates
- what kinds of future change the decision makes easier or harder

### 8. Make implementation and validation thinkable

MADR’s `Confirmation` section is especially useful here. It asks how compliance with the ADR can be confirmed.

This is a strong practice when the decision needs real enforcement, for example:

- code review checks
- architecture tests
- operational controls
- fitness functions
- explicit follow-up tasks

Without this, ADRs can become aspirational rather than operational.

## Common ADR anti-patterns

Zimmermann’s creation guidance is especially valuable here.

Key anti-patterns include:

- **Wishful thinking / fairy tale**: shallow justification, often only pros and no cons.
- **Sales pitch**: marketing language and unsupported claims.
- **Free lunch coupon**: no meaningful costs or consequences are documented.
- **Dummy alternative**: fake options are listed only to make the preferred option win.
- **Sprint / rush**: only short-term effects are considered.
- **Tunnel vision**: only one local perspective is considered, ignoring operations, maintenance, or other stakeholders.
- **Maze**: the ADR topic and the ADR content drift apart.
- **Too large / epic ADR**: multiple decisions are bundled together until the record becomes hard to use.

These failures all make later review and maintenance harder.

## Review best practices

ADR quality does not come from template structure alone. Review is a core practice.

Zimmermann’s review guidance recommends at least three review perspectives:

- peer/internal reviewer
- stakeholder reviewer
- external authority reviewer

His checklist is a strong operational baseline. Reviewers should ask:

1. Is the problem relevant enough to deserve an ADR?
2. Do the options plausibly solve the problem?
3. Are the decision drivers complete and coherent?
4. If criteria conflict, are they prioritized?
5. Is the chosen solution justified?
6. Are consequences reported objectively?
7. Is the decision actionable and traceable, and does it define validity or review timing if needed?

Best review practice is constructive, concrete, and actionable. Review comments should help improve the ADR, not merely display expertise.

Review anti-patterns include:

- pass-through review with no meaningful scrutiny
- copy-edit-only review that ignores content quality
- self-promotion or conflict-of-interest review
- authority-based review without technical reasoning
- repetitive "Groundhog Day" comments without actionable progress

## Managing ADRs as a log

Writing single ADRs well is only half the problem. Teams also need a management model for the log itself.

### Naming and numbering

Nygard recommends sequential, monotonic numbering. MADR also recommends sequential numbered filenames.

This supports:

- stable references
- easier linking between ADRs
- chronological reading
- cleaner supersession chains

Number reuse is a bad idea because it makes citations ambiguous.

### Repository location

The common recommendation is to keep ADRs in the repository, near code and durable technical docs. Nygard explicitly recommends storing them in version control. MADR suggests `docs/decisions` and allows alternative folder structures.

Benefits:

- same review workflow as code
- same history model
- easier cross-linking with code, issues, and PRs
- better chance the docs remain maintained

### Categorization

MADR notes that large projects may organize ADRs by subdirectory, for example by backend or UI. This can help at scale, but it is a meta-decision with trade-offs:

- easier local navigation
- but numbering may cease to be globally unique
- and the classification scheme itself must stay stable enough to be useful

For small repositories, a single ADR directory is usually simpler.

### Metadata

MADR’s decisions on status and YAML front matter show a preference for machine-readable metadata where it helps readers and tooling.

Useful metadata commonly includes:

- status
- date
- optional decision participants
- optional tags or navigation fields, depending on local tooling

Best practice is to keep metadata lightweight. If the frontmatter becomes a mini-database, authors stop maintaining it.

## Lifecycle management: status, revisits, and supersession

This is the most important part for the user’s example.

### Baseline rule: do not rewrite history casually

Nygard is explicit: if a decision is reversed, keep the old ADR and mark it as superseded. The point is that it was once the real decision, and that historical fact still matters.

This is the clearest durable-management rule in the source set.

### Why superseding is better than deleting

Keeping the old ADR and marking it `superseded` preserves:

- the original rationale
- the fact that the team made the decision intentionally
- the trigger for why it later changed
- the decision chain for future maintainers

Deleting an ADR throws away architectural memory and makes later readers think the newer decision was always obvious.

### Status model

Across the sources, the common lifecycle statuses are:

- proposed
- accepted
- deprecated
- superseded
- sometimes rejected

MADR’s template explicitly supports statuses including `superseded by ADR-0123`. That reinforces the idea that supersession is not just a free-text note but a first-class lifecycle event.

### Recommended maintenance policy

Inferred best practice for durable ADR logs:

1. `proposed` while discussion is active.
2. `accepted` once the decision is agreed and becomes authoritative.
3. `deprecated` when still historically relevant but no longer recommended, without a clean one-to-one replacement.
4. `superseded` when a newer ADR replaces it.
5. `rejected` for documented options that were explicitly declined.

This implies:

- do not silently edit an accepted ADR to mean something new
- write a new ADR when the decision meaning materially changes
- update status and cross-links on the old ADR
- link the new ADR back to the one it replaces

I infer this as the strongest management norm from Nygard plus MADR. While one later Zimmermann post mentions marking ADRs outdated or superseded and even deleting them in some cases, that appears as a possibility, not the primary recommendation. For durable architectural decisions, preservation plus supersession is the safer and more informative default.

### When deletion may still be reasonable

Deletion is more defensible for:

- accidental duplicate files
- malformed records that never reflected a real decision
- temporary research or planning notes that were never ADRs
- generated or abandoned stubs with no decision value

Deletion is much harder to justify for an accepted ADR that once governed the system.

## Governance practices that make ADRs work

### 1. Define what counts as an ADR

Teams should agree up front what decision classes require ADRs. Otherwise they will either under-document important decisions or create noise.

### 2. Define who can author, approve, and supersede

Even lightweight ADR systems need role clarity:

- who proposes ADRs
- who approves them
- who can mark one superseded
- who must be consulted or informed

MADR’s optional metadata for decision-makers, consulted, and informed exists because the social process matters.

### 3. Define review expectations

Review criteria should be explicit and repeatable. Zimmermann’s checklist is a good base.

### 4. Define follow-through

An ADR without implementation or confirmation mechanisms may never influence the system. This is why confirmation sections, review dates, and linked implementation tasks are useful.

### 5. Revisit at meaningful moments

Revisit triggers include:

- changed requirements
- changed constraints
- new evidence from production
- failed assumptions
- new capabilities in the market or platform
- accumulation of operational pain

Revisit should not mean rewrite in place. It should normally mean a new ADR plus status update on the old one.

## Choosing a template

### Nygard

Best when:

- the team values minimalism
- decisions are not extremely complex
- authors are disciplined enough to supply rationale without heavy scaffolding

Trade-off:

- less structure means less prompting for option analysis and confirmation

### MADR

Best when:

- trade-off analysis matters
- the team benefits from stronger prompts
- review discipline is important
- you want room for confirmation and richer metadata

Trade-off:

- more structure can feel heavy for smaller decisions

### Y-Statement

Best when:

- the team needs very compact records
- decisions are simple enough to summarize in one controlled sentence
- ADR overhead must be minimized

Trade-off:

- may be too compressed for complex trade-offs or long-lived governance decisions

### Practical recommendation

For a repository that wants durable, reviewable architectural records, a Nygard-plus-status baseline or a constrained MADR-style template is usually strongest. If the team especially values long-term maintainability and explicit trade-offs, MADR-style structure is the better default.

## Recommended durable operating policy

Based on the reviewed sources, this is the recommended policy for ADR management:

1. Keep ADRs in version control under a stable numbered directory.
2. Use one ADR per significant decision.
3. Require title, status, date, rationale, and consequences.
4. Prefer explicit alternatives and trade-offs, not only final choices.
5. Review ADRs with a checklist.
6. Keep accepted ADRs historically intact.
7. When the decision changes, write a new ADR and mark the old one `superseded`.
8. Use `deprecated` when a decision has fallen out of favor but is not cleanly replaced by one successor ADR.
9. Avoid deleting accepted ADRs unless they were invalid artifacts rather than real decisions.
10. Treat the ADR log as part of architecture governance, not just documentation.

## Implications for this repository

Given the repo’s existing ADR conventions and the external source base, the strongest operational stance is:

- ADRs should be treated as durable decision records
- when a past decision is no longer current, the default action should be status transition, not removal
- "superseded" should be preferred when a newer ADR replaces the older one
- deletion should be reserved for non-ADR artifacts, mistakes, or temporary documents that were never valid durable decisions

This is an inference from the source corpus, but it is a well-supported one.

## Bottom line

Good ADR writing is not mainly about elegant headings. It is about preserving a decision’s problem, options, rationale, status, and consequences in a form that future readers can trust.

Good ADR management is not mainly about folder naming. It is about lifecycle discipline:

- choose significant decisions
- write them clearly
- review them seriously
- keep them durable
- and when they change, supersede them rather than erasing their history

That "keep and supersede" rule is the single most important management principle to preserve architectural memory over time.

