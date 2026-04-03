// Where: src/main/services/llm-provider-readiness-service.test.ts
// What:  Unit tests for provider readiness snapshots across API-key, local-runtime, and Codex CLI providers.
// Why:   Lock the normalized renderer contract so provider-specific probing does not leak shell details.

import { describe, expect, it, vi } from 'vitest'
import type { CodexCliReadiness } from './codex-cli-service'
import { LlmProviderReadinessService } from './llm-provider-readiness-service'

const createCodexCliService = (readiness: CodexCliReadiness) => ({
  getReadiness: vi.fn(async () => readiness)
})

describe('LlmProviderReadinessService', () => {
  it('reports Google as ready when an API key is configured', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn((provider: string) => (provider === 'google' ? 'key-123' : null)) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot.google).toMatchObject({
      credential: { kind: 'api_key', configured: true },
      status: { kind: 'ready' }
    })
    expect(snapshot.google.models).toEqual([
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', available: true }
    ])
  })

  it('reports Google as missing credentials when no key is configured', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot.google).toMatchObject({
      credential: { kind: 'api_key', configured: false },
      status: { kind: 'missing_credentials' }
    })
  })

  it('reports Ollama as ready when a curated model is installed', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: true as const })),
        listModels: vi.fn(async () => [{ id: 'qwen3.5:2b', label: 'qwen3.5:2b' }])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot.ollama.status).toEqual({ kind: 'ready', message: 'Ollama is available.' })
    expect(snapshot.ollama.models.find((model) => model.id === 'qwen3.5:2b')?.available).toBe(true)
    expect(snapshot.ollama.models.find((model) => model.id === 'qwen3.5:4b')?.available).toBe(false)
    expect(snapshot.ollama.models.find((model) => model.id === 'mitmul/plamo-2-translate')?.available).toBe(false)
  })

  it('reports Ollama as no_supported_models when runtime is healthy but curated models are missing', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: true as const })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot.ollama.status).toEqual({
      kind: 'no_supported_models',
      message: 'No curated Ollama LLM model is installed yet.'
    })
    expect(snapshot.ollama.models.every((model) => model.available === false)).toBe(true)
  })

  it('reports OpenAI subscription as cli_not_installed until Codex CLI is installed', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot['openai-subscription']).toMatchObject({
      credential: { kind: 'cli', installed: false },
      status: { kind: 'cli_not_installed' }
    })
    expect(snapshot['openai-subscription'].models).toEqual([
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', available: false },
      { id: 'gpt-5.4', label: 'gpt-5.4', available: false },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', available: false },
      { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', available: false },
      { id: 'gpt-5.2', label: 'gpt-5.2', available: false },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini', available: false }
    ])
  })

  it('reports OpenAI subscription as cli_login_required when Codex CLI needs sign-in', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_login_required' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot['openai-subscription']).toMatchObject({
      credential: { kind: 'cli', installed: true },
      status: { kind: 'cli_login_required' }
    })
    expect(snapshot['openai-subscription'].models).toEqual([
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', available: false },
      { id: 'gpt-5.4', label: 'gpt-5.4', available: false },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', available: false },
      { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', available: false },
      { id: 'gpt-5.2', label: 'gpt-5.2', available: false },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini', available: false }
    ])
  })

  it('reports OpenAI subscription as ready when Codex CLI is installed and signed in', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'ready', version: '0.28.0' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot['openai-subscription']).toMatchObject({
      credential: { kind: 'cli', installed: true, version: '0.28.0' },
      status: {
        kind: 'ready',
        message: 'Codex CLI 0.28.0 is installed and signed in.'
      }
    })
    expect(snapshot['openai-subscription'].models).toEqual([
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', available: true },
      { id: 'gpt-5.4', label: 'gpt-5.4', available: true },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', available: true },
      { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', available: true },
      { id: 'gpt-5.2', label: 'gpt-5.2', available: true },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini', available: true }
    ])
  })

  it('reports OpenAI subscription probe failures without leaking raw process state', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_probe_failed', message: 'Segmentation fault' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot['openai-subscription']).toMatchObject({
      credential: { kind: 'cli', installed: true },
      status: {
        kind: 'cli_probe_failed',
        message: 'Segmentation fault'
      }
    })
  })

  it('normalizes generic OpenAI subscription probe failures into actionable guidance', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => ({ ok: false as const, code: 'runtime_unavailable' as const, message: 'Ollama is not installed.' })),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_probe_failed', message: 'Codex CLI readiness probe failed with exit code 9.' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot['openai-subscription']).toMatchObject({
      status: {
        kind: 'cli_probe_failed',
        message: 'Codex CLI is installed, but Dicta could not confirm login state (exit code 9). Run `codex login`, then refresh.'
      }
    })
  })

  it('degrades Ollama readiness to unknown when healthcheck throws unexpectedly', async () => {
    const service = new LlmProviderReadinessService({
      secretStore: { getApiKey: vi.fn(() => null) } as any,
      localLlmRuntime: {
        healthcheck: vi.fn(async () => {
          throw new Error('socket hang up')
        }),
        listModels: vi.fn(async () => [])
      } as any,
      codexCliService: createCodexCliService({ kind: 'cli_not_installed' }) as any
    })

    const snapshot = await service.getSnapshot()
    expect(snapshot.ollama.status).toEqual({
      kind: 'unknown',
      message: 'socket hang up'
    })
  })
})
