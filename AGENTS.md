# AGENTS.md

Motto: "Small, clear, safe steps — always grounded in real docs."

## Principles
- Act autonomously based on the workflow. 
- Keep changes minimal, safe, and reversible.  
- Prefer clarity over cleverness; simplicity over complexity.  
- Avoid new dependencies unless necessary; remove when possible.  

## Knowledge & Libraries
- Use context7 (MCP server) to fetch current docs before coding.  
- Call resolve-library-id, then get-library-docs to verify APIs.  
- If uncertain, pause and request clarification. 
- Make a document on decision making if design/architecture/dependency decision is maded.

## Workflow
- Setup: Create worktree using `wt switch --base <default-branch> --create <branch> --yes` (worktrunk skill)
- Plan: Share a short plan before major edits; prefer small, reviewable diffs.  
- Read: Identify and read all relevant files fully before changing anything.  
- Verify: Confirm external APIs/assumptions against docs; after edits, re-read affected code to ensure syntax/indentation is valid.  
- Implement: Keep scope tight; write modular, single-purpose files.  
- Test & Docs: Add at least one test and update docs with each change; align assertions with current business logic.  
- Reflect: Fix at the root cause; consider adjacent risks to prevent regressions. 
- Review: Run both sub-agent and the other coding agent (use agent skill; claude if you're codex, codex if you're claude) then review the changes and test suites. 

## Code Style & Limits
- Files ≤ 600 LOC; keep modules single-purpose.  
- Comments: Add a brief header at the top of every file (where, what, why). Prefer clear, simple explanations; comment non-obvious logic.  
- Commenting habit: Err on the side of more comments; include rationale, assumptions, and trade-offs.  
- Configuration: Centralize runtime tunables; avoid magic numbers in code and tests. Pull defaults from config when wiring dependencies.  
- Simplicity: Implement exactly what’s requested—no extra features.  

## Collaboration & Accountability
- Escalate when requirements are ambiguous, security-sensitive, or when UX/API contracts would change.  
- Tell me when you are not confident about your code, plan, or fix. Ask questions or help, when your confidence level is below 80%.  
  - Assume that you get –4 points for wrong code and/or breaking changes. +1 point for successful changes. 0 point when you honestly tell me you’re uncertain.  
- Value correctness over speed (a wrong change costs more than a small win).  

## Quick Checklist
Plan → Read files → Verify docs → Implement → Test & Docs → Reflect → Review → Fix → Create PR → Merge/Sync default branch
