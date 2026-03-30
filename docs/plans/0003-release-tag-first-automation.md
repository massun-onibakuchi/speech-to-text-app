---
title: Release tag-first automation plan
description: Break the release workflow refactor into ticket-sized steps that create the tag from a main version bump and build releases only from tagged source.
date: 2026-03-30
status: active
review_by: 2026-04-06
tags:
  - planning
  - release
  - github-actions
---

# Release tag-first automation plan

## Goal

Replace the current manual-tag release flow with a stricter tag-first automation model:
- a real `package.json#version` bump on `main` creates the matching `vX.Y.Z` tag
- the release build runs from that tag, not from a moving branch head
- manual reruns are allowed only from an existing tag ref
- the workflow rejects mismatched tag/version states instead of silently publishing ambiguous artifacts

## Non-goals

- Changing artifact formats, signing, notarization, or release asset naming
- Adding auto-update metadata or a release-notes authoring system
- Changing how application versions are chosen semantically

## Definition of Done

A ticket is done only when all of the following are true:
- code changes for that ticket are merged into one reviewable diff
- the workflow behavior is covered by focused tests where practical
- release docs match the new behavior exactly
- `pnpm vitest run` for the new helper/tests passes
- `pnpm run release:dry-run` passes
- the release path cannot publish assets from an untagged or mismatched commit

## Execution order

| Order | Ticket | Scope | Depends on |
| --- | --- | --- | --- |
| T1 | Release plan helper | Add explicit release decision logic and test coverage | none |
| T2 | Workflow refactor | Create tag on `main` version bump, then build from tag | T1 |
| T3 | Docs sync | Align release docs with the new immutable-source workflow | T1, T2 |
| T4 | Verification and review | Run release dry-run, focused tests, and review passes | T1, T2, T3 |

## Ticket T1: Release plan helper

### Goal

Move release decision logic out of inline shell branching and into a tested helper that decides:
- which tag name should be used
- whether a release should happen
- whether the workflow should create the tag or only use an existing one

### Task breakdown

1. Add a helper script that reads `package.json#version`.
2. Validate that tag refs match the package version exactly.
3. Return a structured plan for:
   - `main` push with version bump
   - `main` push without version bump
   - existing tag rerun
   - branch/manual refs that must be skipped
4. Add unit tests for each release mode and rejection path.

### Definition of Done

- helper output is deterministic JSON
- mismatched tag/package version throws a hard error
- tests cover main bump, no-op main push, tag rerun, and branch-dispatch skip

### Files

- `scripts/resolve-release-plan.mjs`
- `scripts/resolve-release-plan.test.ts`

### Code sketch

```js
return {
  tagName: `v${packageVersion}`,
  shouldRelease: versionChanged,
  shouldCreateTag: versionChanged,
  source: 'main_version_bump'
}
```

## Ticket T2: Workflow refactor

### Goal

Refactor the GitHub Actions release workflow so the release source is always an immutable tag, even when automation starts from a push to `main`.

### Task breakdown

1. Trigger the workflow from `main` pushes that touch `package.json`.
2. Resolve the previous package version from `github.event.before`.
3. Skip the workflow when `package.json` changed but the version did not.
4. Create the `vX.Y.Z` tag on the current commit when a real version bump is detected.
5. Fail hard if the tag already exists on a different commit.
6. Checkout the release tag before verification/build steps.
7. Keep manual reruns limited to existing tag refs only.
8. Upload assets only to the release that matches the checked-out tag.

### Definition of Done

- a main version bump produces a tag before build starts
- the build and upload steps run from `refs/tags/vX.Y.Z`
- manual reruns from branch refs do not publish
- existing mismatched tags fail loudly instead of being overwritten

### Files

- `.github/workflows/release-macos.yml`

### Code sketch

```yaml
- name: Create release tag
  run: |
    git tag "${TAG_NAME}" "${GITHUB_SHA}"
    git push origin "refs/tags/${TAG_NAME}"

- name: Checkout release tag
  run: git checkout "refs/tags/${TAG_NAME}"
```

## Ticket T3: Docs sync

### Goal

Make the repo documentation describe one release flow clearly, without legacy “maybe tag manually first” ambiguity.

### Task breakdown

1. Update the release checklist to describe the new main-bump flow.
2. Document tag-only manual reruns and backfills.
3. Remove stale wording that implies the workflow only runs after a manual tag push.

### Definition of Done

- docs describe the same flow the workflow enforces
- docs do not promise any branch-based manual rerun path
- docs remain concise enough for release operators to use directly

### Files

- `docs/release-checklist.md`
- `readme.md`

### Code sketch

```md
- Bump `package.json#version` on `main`; the release workflow creates the
  matching `vX.Y.Z` tag before building.
```

## Ticket T4: Verification and review

### Goal

Verify that the refactor is safe, reproducible, and reviewable before commit/push.

### Task breakdown

1. Run focused helper tests.
2. Run helper smoke checks for:
   - main version bump
   - tag rerun
   - branch ref skip
3. Run `pnpm run release:dry-run`.
4. Run a sub-agent review focused on release integrity and workflow safety.
5. Run a second review pass with Claude.
6. Fix any findings before closeout.

### Definition of Done

- helper tests pass
- release dry-run passes
- at least one review pass returns no findings
- any failed or timed-out secondary review is reported explicitly

### Verification commands

```sh
pnpm vitest run scripts/resolve-release-plan.test.ts scripts/report-release-artifacts.test.ts
RELEASE_PREVIOUS_PACKAGE_VERSION=0.1.2 GITHUB_EVENT_NAME=push GITHUB_REF_TYPE=branch GITHUB_REF_NAME=main node scripts/resolve-release-plan.mjs
GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v0.2.0 node scripts/resolve-release-plan.mjs
pnpm run release:dry-run
```

## Ticket status

| Ticket | Status | Notes |
| --- | --- | --- |
| T1 | completed | Helper + tests added |
| T2 | completed | Workflow now creates tag then builds from tag |
| T3 | completed | Release docs aligned with workflow |
| T4 | completed | Verification ran; sub-agent review passed; Claude final pass timed out and was reported |

## Follow-up notes

- If the team wants a stricter failure mode for missing `github.event.before` history, replace the permissive fallback with an explicit hard fail.
- If the team wants fully isolated release reruns, the next increment would be a dedicated tag-rerun workflow instead of sharing one workflow file for both entry paths.
