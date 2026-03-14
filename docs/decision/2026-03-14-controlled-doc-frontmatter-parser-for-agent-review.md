---
type: decision
status: accepted
created: 2026-03-14
tags:
  - docs
  - automation
---

<!--
Where: docs/decision/2026-03-14-controlled-doc-frontmatter-parser-for-agent-review.md
What: Decision record for a facts-only controlled-doc frontmatter parser plus external agent review.
Why: Keep repo automation deterministic and low-noise while delegating judgment about document quality and lifecycle actions to an autonomous reviewer.
-->

# Decision: Controlled Doc Frontmatter Parser for Agent Review

## Status

Accepted on March 14, 2026.

## Decision

- The repository will provide a controlled-doc frontmatter parser that emits a compact Markdown inventory.
- The parser is facts-only: it reports discovered frontmatter fields and parse errors, but it does not classify documents as stale, valid, invalid in policy terms, or prune candidates.
- CI may send the parser output to an external autonomous reviewer through Telegram and Takopi.
- The autonomous reviewer is responsible for judging document quality, lifecycle state, and recommended actions such as update, archive, delete, or rename.

## Why

- Frontmatter extraction is deterministic and cheap, which makes it a stable repository concern.
- Lifecycle judgment is more subjective and benefits from broader file inspection than frontmatter alone can provide.
- A low-token Markdown inventory is easier for autonomous reviewers to consume than JSON while remaining readable to humans.
- Keeping the script facts-only avoids drifting business rules into shell automation that would later need separate policy maintenance.

## Consequences

- Repository-side tests should verify report shape and malformed-frontmatter continuation behavior.
- Workflow prompts must state clearly that the agent should inspect files autonomously before making cleanup recommendations.
- Future lifecycle policy changes can be handled in the reviewer prompt or a separate policy layer without forcing parser changes.
