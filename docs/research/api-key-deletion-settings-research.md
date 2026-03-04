<!--
Where: docs/research/api-key-deletion-settings-research.md
What: Deep research document describing current API-key lifecycle and why Settings cannot delete saved keys.
Why: Issue analysis for adding safe, explicit API-key deletion from Settings.
-->

# Research: API Key Deletion Gap in Settings

## 1. Scope and Problem Statement

### Feature/issue under study
Current Settings UI allows users to add or replace API keys, but does **not** provide a way to delete a saved API key.

### Why this matters
- Users can accidentally keep stale/compromised keys configured.
- Users cannot intentionally "unset" a key from Settings when rotating providers or troubleshooting.
- The UI has a `Saved`/`Not set` mental model, but only supports transitions:
  - `Not set -> Saved` (save new key)
  - `Saved -> Saved` (replace key)
- Missing transition:
  - `Saved -> Not set` (delete key)

## 2. Architecture Overview (How API keys currently work)

## 2.1 Layers

1. Renderer (React): key input fields, blur-triggered save intent, saved/not-set status display.
2. Preload bridge: exposes `getApiKeyStatus`, `setApiKey`, `testApiKeyConnection` to renderer.
3. IPC handlers (main): routes API-key requests into `SecretStore` and connection testing service.
4. Main secret persistence (`SecretStore` + `SafeStorageClient`): stores/retrieves keys via encrypted store (when available), volatile memory fallback, then env-var fallback for reads.
5. Runtime preflight/orchestrators: call `secretStore.getApiKey(...)` to decide if STT/LLM actions are blocked.

## 2.2 Provider model

- STT providers: `groq`, `elevenlabs`
- LLM provider: `google`
- API key provider union is shared in [`src/shared/ipc.ts`](../../src/shared/ipc.ts).

## 3. Current Data and API Contracts

## 3.1 Renderer-facing IPC contract

From [`src/shared/ipc.ts`](../../src/shared/ipc.ts):
- `getApiKeyStatus(): Promise<{ groq: boolean; elevenlabs: boolean; google: boolean }>`
- `setApiKey(provider, apiKey): Promise<void>`
- `testApiKeyConnection(provider, candidateApiKey?): Promise<{ provider: ApiKeyProvider; status: 'success' | 'failed'; message: string }>`

Notably absent:
- No `deleteApiKey(provider)` API.
- No explicit semantic for delete in the existing contract (only set/status/test).

## 3.2 Main-process handler behavior

In [`src/main/ipc/register-handlers.ts`](../../src/main/ipc/register-handlers.ts):
- `getApiKeyStatus` returns booleans based on `secretStore.getApiKey(provider) !== null`.
- `setApiKey` directly calls `secretStore.setApiKey(provider, apiKey)`.
- `testApiKeyConnection` uses candidate key only when `candidateApiKey?.trim()` is non-empty; otherwise it uses persisted key.

Design implication:
- Status is **derived** from retrievability of a non-empty key.
- There is no dedicated remove path, even though `setApiKey(provider, '')` could simulate clearing under current storage semantics.

## 3.3 Storage behavior (`SecretStore`)

From [`src/main/services/secret-store.ts`](../../src/main/services/secret-store.ts):
- `setApiKey` writes to encrypted safeStorage when available and successful; on unavailability or any safeStorage error, it stores in volatile in-memory map.
- `getApiKey` read chain:
  1. Safe-storage value (if available)
  2. Volatile in-process map
  3. Environment variable fallback (`GROQ_APIKEY`, `ELEVENLABS_APIKEY`, `GOOGLE_APIKEY`)
- Empty-string normalization:
  - safeStorage value `''` -> returns `null`
  - volatile value `''` -> returns `null`

Critical subtlety:
- Explicitly storing `''` in safe/volatile blocks env fallback (because tier 1/2 returns explicit empty -> null and exits before env fallback).
- This behavior effectively acts as a "local clear override" over env-provided keys.

## 3.4 Encrypted storage details (`SafeStorageClient`)

From [`src/main/infrastructure/safe-storage-client.ts`](../../src/main/infrastructure/safe-storage-client.ts):
- Uses Electron `safeStorage.encryptString/decryptString`.
- Persists encrypted base64 blobs inside an `electron-store` file named `secrets`.
- API supports `setPassword/getPassword` only; no explicit delete method currently implemented.

## 4. Current Settings UX Behavior

## 4.1 STT key UI

From [`src/renderer/settings-stt-provider-form-react.tsx`](../../src/renderer/settings-stt-provider-form-react.tsx):
- One key input rendered for currently selected STT provider.
- Saved key appears as fixed 50-char redaction mask (`FIXED_API_KEY_MASK`).
- On blur:
  - Empty draft: do nothing; return to redacted mode.
  - Non-empty draft: call `onSaveApiKey(provider, trimmed)`.

## 4.2 Google key UI

From [`src/renderer/settings-api-keys-react.tsx`](../../src/renderer/settings-api-keys-react.tsx):
- Same pattern for Google key in LLM section.
- Same blur behavior: save only when non-empty draft.

## 4.3 Save mutation path

From [`src/renderer/settings-mutations.ts`](../../src/renderer/settings-mutations.ts):
- `saveApiKey(provider, value)` trims input.
- If empty: sets "Enter a key before saving." and aborts.
- If non-empty:
  - validates key via `testApiKeyConnection(provider, trimmed)`
  - then persists via `setApiKey(provider, trimmed)`
  - refreshes status via `getApiKeyStatus()`
- Per-provider promise queue serializes overlapping saves.

Design implication:
- Renderer intentionally forbids empty-string saves.
- That UI/logic guard is the immediate reason users cannot delete via settings.

## 4.4 Non-secret autosave split

- Non-secret settings autosave (450ms debounce) in renderer app orchestration.
- API keys are intentionally excluded from non-secret autosave and use their own blur-save flow.
- This split is documented in `docs/decisions/settings-non-api-autosave.md` and `docs/decisions/api-key-blur-autosave.md`.

## 5. Runtime Effects of Key Presence/Absence

## 5.1 Blocking behavior

From [`src/renderer/blocked-control.ts`](../../src/renderer/blocked-control.ts):
- Missing STT key blocks recording and points user to Settings > Speech-to-Text.
- Missing Google key blocks transformation and points user to Settings > LLM Transformation.

## 5.2 Preflight behavior

From [`src/main/orchestrators/preflight-guard.ts`](../../src/main/orchestrators/preflight-guard.ts):
- API key absence blocks preflight with actionable reason.
- This means true deletion support would immediately affect action availability and blocked messaging.

## 6. Why Deletion Is Missing (Root Cause)

Deletion is not blocked by storage primitives; it is blocked by product and contract shape:

1. **No deletion action in IPC contract** (`set`, `status`, `test` only).
2. **UI only models add/replace flow**, not remove flow.
3. **Mutation guard rejects empty values**, preventing clear-through-empty behavior.
4. **Decision records optimized for save-on-blur + redaction**, but do not define delete interaction.

In short: this is a missing workflow/state transition, not a low-level persistence limitation.

## 7. Existing Tests and Gaps

## 7.1 Strong coverage already present

- `settings-api-keys-react.test.tsx` and `settings-stt-provider-form-react.test.tsx` cover:
  - redacted rendering
  - blur-save semantics
  - provider switching behavior
  - no visibility toggle/button assumptions
- `secret-store.test.ts` covers fallback tiers and explicit-empty semantics.

## 7.2 Coverage gap for deletion

Missing test classes:
- renderer component behavior for explicit delete action.
- mutation behavior for delete success/failure and status refresh.
- IPC delete contract tests.
- runtime preflight transitions after deleting a key.

## 7.3 Test-doc drift discovered

`e2e/electron-ui.e2e.ts` still contains a test named `supports API key show/hide toggle and per-provider connection status` that expects:
- `[data-api-key-visibility-toggle=...]`
- `[data-api-key-test=...]`

Current components no longer render these controls (redaction decision + blur autosave migration). This indicates stale e2e expectations in that test block.

## 8. External API/Library Verification (Context7)

This research verified upstream behavior for storage stack assumptions:

- Electron `safeStorage`:
  - `isEncryptionAvailable()` indicates platform/runtime availability.
  - `encryptString/decryptString` perform OS-backed encryption/decryption.
- `electron-store`:
  - JSON persistence in app user data path.
  - supports `get`, `set`, and `delete` APIs.

Implication for this issue:
- The storage stack can support delete semantics; current app code simply has not exposed it as first-class behavior.

## 9. Implementation Option Space for Deletion

## Option A (Minimal change): Treat explicit clear as delete

Behavior:
- Add a delete control in UI.
- On delete action, call `setApiKey(provider, '')`.

Pros:
- Smallest diff.
- Reuses current `SecretStore` empty normalization.
- Minimal IPC surface change.

Cons:
- Delete semantics remain implicit/encoded as empty string.
- Harder to reason about intent in telemetry/logging/tests.

## Option B (Preferred): Introduce explicit delete API

Behavior:
- Add `deleteApiKey(provider)` to shared IPC + preload + main handlers.
- Add `secretStore.deleteApiKey(provider)` and (optionally) `safeStorageClient.deletePassword(account)`.
- UI uses explicit delete action.

Pros:
- Clear contract and intent.
- Easier long-term maintenance and test readability.
- Avoids overload of `set` with destructive semantics.

Cons:
- Slightly larger multi-layer diff.

## Option C: Hybrid backward-compatible rollout

Behavior:
- Implement explicit delete API, but keep internal empty-string semantics as fallback.

Pros:
- Safe migration path.
- Useful for incremental rollout.

Cons:
- Transitional complexity.

## 10. Behavioral Edge Cases Deletion Must Define

1. If env var is configured and user deletes locally, should local delete continue overriding env fallback?
- Current empty-string behavior already enforces override; explicit delete should preserve or intentionally revise this.

2. Should delete require confirmation?
- Deletion changes runtime availability immediately (recording/transform preflight), so accidental deletion can disrupt workflows.

3. UI state after delete:
- Must transition `Saved -> Not set` reliably.
- Must clear draft/redaction state and show deterministic status feedback.

4. Should deletion bypass online validation?
- Deleting a key should not depend on network/provider validation.

## 11. Concrete Change Surface if Implemented

Likely files to touch:

- IPC contract + channels:
  - `src/shared/ipc.ts`
  - `src/preload/index.ts`
  - `src/main/ipc/register-handlers.ts`
- Storage services:
  - `src/main/services/secret-store.ts`
  - `src/main/infrastructure/safe-storage-client.ts`
- Settings UI + mutations:
  - `src/renderer/settings-stt-provider-form-react.tsx`
  - `src/renderer/settings-api-keys-react.tsx`
  - `src/renderer/settings-mutations.ts`
  - possibly `src/renderer/app-shell-react.tsx` callback surface
- Tests:
  - renderer component tests (both key forms)
  - secret store tests
  - IPC/main handler tests
  - e2e flow for delete and blocked behavior
- Docs/decisions:
  - new decision record for API-key deletion UX + semantics

## 12. Recommendation

For this codebase, Option B (explicit delete API) is the cleanest long-term direction:
- preserves current blur-save behavior for add/replace,
- adds explicit destructive intent for delete,
- keeps status model (`Saved`/`Not set`) consistent,
- avoids ambiguous empty-string overloading in renderer contracts.

## 13. Primary Source Index

Internal code/docs:
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/secret-store.ts`
- `src/main/infrastructure/safe-storage-client.ts`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/blocked-control.ts`
- `src/main/orchestrators/preflight-guard.ts`
- `src/renderer/settings-api-keys-react.test.tsx`
- `src/renderer/settings-stt-provider-form-react.test.tsx`
- `src/main/services/secret-store.test.ts`
- `e2e/electron-ui.e2e.ts`
- `docs/decisions/api-key-blur-autosave.md`
- `docs/decisions/api-key-redaction-after-save.md`
- `docs/decisions/fixed-api-key-mask.md`
- `docs/decisions/settings-non-api-autosave.md`
- `docs/decisions/stt-provider-unified-form.md`

External references (verified via Context7):
- Electron safeStorage API docs: https://github.com/electron/electron/blob/main/docs/api/safe-storage.md
- electron-store README: https://github.com/sindresorhus/electron-store/blob/main/readme.md
