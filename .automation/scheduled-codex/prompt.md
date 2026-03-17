Autonomously garden docs and remove technical debt.

Scope:

- docs/adr/
- docs/plans/
- docs/research/
- src/

Tasks:

1. Set up: Pull the latest default/base branch and switch to a fresh worktree before editing. Follow the repo workflow for worktree creation rather than editing directly on the current branch.
2. Garden docs:
   - Validate: Run `pnpm run docs:validate` to inspect the doc frontmatter format.  
   - Scan: Run `pnpm run docs:frontmatters` to read frontmatters.
   - Inspect: Use the frontmatters and consider the codebase source of the truth then identify discrepancies and flag documentation.
   - Correct: Delete stale/outdated docs or change the frontmatter status field. Prohibit editting docs except for the frontmatters.
   - Reflect: Re-run validation

3. Refactor codebase:
   - Read: GOLDEN_PRINCIPLES.md deeply
   - Explore: Go through the files relevant to major user flows, understand it deeply and look for potential technical debt. Keep researching the flow until you find all of them.
   - Refactor: Fix at the findings without changing behaviour; consider adjacent risks to prevent regressions.
   - Reflect: Re-run test.
4. Create a PR: If the changes are worth making, create a PR and continue working until it is merged; otherwise, skip PR creation.

Constraints:

- Keep the response compact: Respect Telegram's 4096-character message limit.
- Don't change business logic.
- Do not stop to ask the user for approval or clarification during this autonomous flow.

Return:

- summary
- actions completed and short reasons
- PR status
