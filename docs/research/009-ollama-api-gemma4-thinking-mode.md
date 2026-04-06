# Research 009: Ollama API & Gemma 4 E2B/E4B — Thinking Mode

**Date:** 2026-04-06
**Author:** Claude (agent)
**Status:** Draft
**Scope:** How to support thinking / no-thinking mode for `gemma4:e2b-it-q4_K_M` and `gemma4:e4b-it-q4_K_M` via the Ollama HTTP API, and what changes are required in the existing `OllamaLocalLlmRuntime`.

---

## 1. Gemma 4 E2B / E4B Model Overview

Google DeepMind's Gemma 4 "E" series uses **Per-Layer Embeddings (PLE)** to maximise parameter efficiency for on-device / edge deployment. "E" stands for *effective* parameters.

| Variant | Effective params | Total params | Context window | Modalities |
|---------|-----------------|--------------|----------------|------------|
| E2B     | 2.3 B           | ~4 B         | 128 K tokens   | Text, Image, Audio |
| E4B     | 4.5 B           | 8 B          | 128 K tokens   | Text, Image, Audio |

Both variants are instruction-tuned (`-it`) and, in the Ollama catalog, distributed in Q4_K_M quantisation (`-q4_K_M`).

Recommended sampling parameters (from HuggingFace model card):

```
temperature = 1.0
top_p       = 0.95
top_k       = 64
```

---

## 2. Thinking Mode — How It Works

### 2.1 Control token

Gemma 4 thinking is **not** a sampler option — it is controlled by a special control token placed at the **beginning of the system prompt**:

| Mode | System prompt prefix |
|------|---------------------|
| Thinking ON  | `<\|think\|>` (then the rest of the system prompt) |
| Thinking OFF | *(no token; system prompt starts normally)* |

When the `<|think|>` token is present the model generates an internal chain-of-thought block before emitting its final answer:

```
<|channel>thought
[internal reasoning ...]
<channel|>
[final answer]
```

When thinking is **disabled** (no token), the E2B/E4B models skip the reasoning block entirely and go straight to the final answer. (Note: other Gemma 4 variants still emit an empty thought block `<|channel>thought\n<channel|>` before the answer even without the token — E2B/E4B do **not**.)

### 2.2 Multi-turn handling

In multi-turn conversations, **only the final answer** must be stored in the conversation history — the `<|channel>thought … <channel|>` block from previous assistant turns must be stripped before the next user turn is sent. Sending prior thinking blocks causes the model to drift or produce malformed output.

### 2.3 Ollama's role in chat-template management

Per official Ollama documentation:

> "Ollama already handles the complexities of the chat template for you."

This means Ollama's `/api/chat` endpoint applies the `<|think|>` token automatically when `think: true` is passed — callers do **not** need to manually inject the token into the system prompt string. Similarly, Ollama strips thinking blocks from history when building multi-turn context.

---

## 3. Ollama HTTP API — Relevant Endpoints

Base URL: `http://localhost:11434`

### 3.1 `POST /api/generate`

Used by the current `OllamaLocalLlmRuntime` for transformation requests (non-streaming, single-shot).

**Request body (relevant fields):**

```jsonc
{
  "model": "gemma4:e4b-it-q4_K_M",
  "prompt": "...",
  "system": "...",            // system prompt — for non-chat generate
  "think": false,             // ← top-level field, NOT inside "options"
  "format": { /* JSON schema */ },
  "stream": false,
  "options": {
    "temperature": 0,
    "top_k": 64,
    "top_p": 0.95,
    "num_ctx": 8192           // optional: override context window
  }
}
```

**Response body (non-streaming):**

```jsonc
{
  "model": "gemma4:e4b-it-q4_K_M",
  "response": "...",          // the generated text (or JSON string when format set)
  "done": true,
  "done_reason": "stop",      // "stop" | "length" | "context_length"
  "thinking": "...",          // present when think:true — internal reasoning text
  "total_duration": 12345678,
  "prompt_eval_count": 42,
  "eval_count": 128
}
```

### 3.2 `POST /api/chat`

Multi-turn conversation endpoint. Supports the same `think` flag as a **top-level field**.

**Request body (relevant fields):**

```jsonc
{
  "model": "gemma4:e4b-it-q4_K_M",
  "messages": [
    { "role": "system",    "content": "You are a translation assistant." },
    { "role": "user",      "content": "Translate: ..." }
  ],
  "think": false,             // top-level — NOT inside "options"
  "format": { /* JSON schema */ },
  "stream": false,
  "options": {
    "temperature": 0,
    "top_k": 64,
    "top_p": 0.95
  }
}
```

**Response message object:**

```jsonc
{
  "role": "assistant",
  "content": "...",           // final answer
  "thinking": "..."           // present only when think:true
}
```

---

## 4. Critical: `think` Placement Bug in `/api/generate`

**Issue:** Ollama GitHub issue #14793 documents that placing `think: false` inside the `options` object in `/api/generate` is silently ignored — the model still reasons, consuming the entire token budget and returning an empty response.

**Correct placement:** `think` must be a **top-level field** in the request JSON, not nested under `options`:

```jsonc
// ✅ Correct
{ "model": "...", "think": false, "options": { "temperature": 0 } }

// ❌ Wrong — silently ignored in /api/generate
{ "model": "...", "options": { "think": false, "temperature": 0 } }
```

This affects `/api/generate`. The `/api/chat` endpoint correctly honours the top-level `think` flag.

---

## 5. Current Codebase State

### 5.1 `OllamaLocalLlmRuntime.transform()` — key details

File: `src/main/services/local-llm/ollama-local-llm-runtime.ts`

The runtime currently calls `POST /api/generate` with:

```typescript
body: JSON.stringify({
  model: modelId,
  system: request.systemPrompt.trim(),
  prompt: buildPromptBlocks({ sourceText: request.text, userPrompt: request.userPrompt }).join('\n\n'),
  format: OLLAMA_TRANSFORMATION_RESPONSE_SCHEMA,
  stream: false,
  options: {
    temperature: 0
  }
})
```

**Missing:** There is no `think` field. For models that support thinking (gemma4), the model's default behaviour determines whether thinking runs. Without `think: false`, gemma4 may spend tokens on reasoning, increasing latency and risking truncation under the `LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS` (15 s) budget.

### 5.2 Catalog model `family` field

File: `src/main/services/local-llm/catalog.ts`

The `SupportedLocalLlmModel` interface already has a `family` field. The two new models use `family: 'gemma4'`. This field is the natural hook for per-family request customisation (e.g., injecting `think: false` only for gemma4 models).

### 5.3 No thinking-aware response parsing

The current `parseStructuredResponse` only reads `response.response` (the text payload). It does not read or strip `response.thinking`. This is fine for thinking-disabled mode, but if thinking were enabled, the thinking content would need to be discarded from the structured JSON parse path.

---

## 6. How to Support Thinking / No-Thinking in the Runtime

### 6.1 Strategy decision: thinking OFF by default

For the transformation use-case (converting text to `{ transformed_text }` JSON), thinking mode adds latency without benefit — the task is deterministic text rewriting, not open-ended reasoning. The recommendation is:

- **Disable thinking by default** for all gemma4 models in transformation requests by injecting `think: false` as a top-level field.
- Keep the door open for enabling thinking in future use-cases by making this per-model or per-request configurable via the catalog `family` field.

### 6.2 Required changes (not implemented yet)

1. **`ollama-local-llm-runtime.ts`** — add a `think` top-level field to the `/api/generate` request body, resolved per model from the catalog:
   - If `model.family === 'gemma4'` → `think: false`
   - Otherwise → omit the field (preserve existing behaviour for qwen/plamo models)

2. **`catalog.ts`** — optionally add a `supportsThinking: boolean` field to `SupportedLocalLlmModel` to make this explicit and extensible, rather than encoding it as a family-string check.

3. **`OllamaGenerateResponse` type** — add optional `thinking?: string` field to the interface for type-safety, even if it is not used in the transformation path.

4. **Tests** — the transformation test for gemma4 model ids should assert that `think: false` is present as a top-level key in the request body.

### 6.3 Alternative: switch to `/api/chat`

The `/api/chat` endpoint is more correct for multi-turn use-cases and does not have the `think` placement bug. However, the current transformation pipeline is single-shot (no conversation history) so `/api/generate` remains appropriate. Switching would require restructuring the prompt into a `messages` array, which is a larger refactor. The top-level `think` fix is sufficient for now.

---

## 7. Open Questions

1. **Structured output + thinking:** Does `format` (JSON schema) still work correctly when `think: false` with gemma4? Needs empirical validation — the model should output raw JSON in `response` as with other models.

2. **Temperature interaction:** Gemma4 recommends `temperature: 1.0` for best results, but the transformation pipeline uses `temperature: 0` for determinism. This may need tuning if output quality is poor.

3. **Context length:** Both E2B and E4B support 128 K context. The current runtime does not set `num_ctx`, defaulting to Ollama's model-level default. For safety, an explicit `num_ctx` appropriate to the transformation task could be set.

4. **Audio/image modalities:** Both E2B/E4B support audio and image inputs. The current pipeline is text-only; multimodal support is out of scope.

5. **Thinking enabled use-case:** If a future non-transformation use-case (e.g., agentic reasoning) wants to enable thinking, the response parsing layer must extract `thinking` from the response and either surface it or discard it. The `<|channel>thought … <channel|>` block also needs to be stripped from multi-turn history.

---

## 8. Summary

| Concern | Finding |
|---------|---------|
| Thinking control mechanism | `<|think|>` token in system prompt; Ollama handles injection via `think` API flag |
| API field name | `think: boolean` — top-level in both `/api/generate` and `/api/chat` |
| Critical placement rule | Must be top-level, **not** inside `options` (issue #14793) |
| Default for transformation | `think: false` — deterministic rewriting does not benefit from chain-of-thought |
| Response field | `thinking` string in response (can be ignored for transformation) |
| Best detection hook | `model.family === 'gemma4'` in `SupportedLocalLlmModel` catalog |
| Endpoint recommendation | Keep `/api/generate`; add top-level `think: false` per gemma4 family |
| Multi-turn history | Ollama strips thinking from history automatically in `/api/chat` |

---

## References

- [Ollama: Generate a chat message — `/api/chat`](https://docs.ollama.com/api/chat)
- [Ollama API reference (GitHub)](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama gemma4:e4b library page](https://ollama.com/library/gemma4:e4b)
- [HuggingFace: google/gemma-4-E4B](https://huggingface.co/google/gemma-4-E4B)
- [Ollama issue #14793: `think=false` ignored in `/api/generate`](https://github.com/ollama/ollama/issues/14793)
