Goal (incl. success criteria):
- Enforce `specs/spec.md` as the sole source of truth.
- Patch docs to remove ambiguity with `specs/ARCTECTURE.md` and resolve review findings in canonical spec.
- Success criteria:
-  - `specs/ARCTECTURE.md` removed.
-  - unresolved findings in `specs/spec.md` (schema/model mismatch, LLM runtime precedence ambiguity) addressed.
-  - changes committed and pushed.

Constraints/Assumptions:
- User explicitly prioritized `specs/spec.md`.
- Documentation-only change; no runtime code changes.

Key decisions:
- Deleted `specs/ARCTECTURE.md`.
- Kept `settings.llm.provider/model` but defined them as UI defaults only.
- Made runtime transformation execution profile-driven via bound profile snapshot.
- Aligned schema/data-model by adding `settings.recording.deviceId` and nested settings classes in diagram.

State:
- Done: architecture doc removed; canonical spec patched to address identified issues.
- Now: committing and pushing requested changes.
- Next: report commit hash and remote status.

Done:
- Deleted `/workspace/.worktrees/doc/spec/specs/ARCTECTURE.md`.
- Patched `/workspace/.worktrees/doc/spec/specs/spec.md`:
  - Added LLM runtime precedence rules in section 6.2.
  - Added `settings.recording.deviceId` to schema section 7.2.
  - Updated class diagram in section 7.3 to reflect nested settings (`RecordingSettings`, `SttSettings`, `LlmSettings`) and composition from `Settings`.
- Re-validated changed lines using `nl -ba` + `rg`.

Now:
- Run `git add`, `git commit`, `git push` on `doc/spec`.

Next:
- Provide commit id and changed file summary.

Open questions (UNCONFIRMED if needed):
- None.

Working set (files/ids/commands):
- `/workspace/.worktrees/doc/spec/CONTINUITY.md`
- `/workspace/.worktrees/doc/spec/specs/spec.md`
- `/workspace/.worktrees/doc/spec/specs/ARCTECTURE.md` (deleted)
- `git add -A && git commit && git push`
