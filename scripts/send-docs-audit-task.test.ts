/*
 * Where: scripts/send-docs-audit-task.test.ts
 * What: Tests for the compact Telegram Takopi review prompt sender.
 * Why: Keep the agent-facing prompt stable while the workflow stays free of
 *      large inline Node snippets.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  buildCtxCommand,
  buildReviewPrompt,
  buildTopicTitle,
  run,
  waitForTelegramRateLimitWindow
} from './send-docs-audit-task.mjs'

describe('buildReviewPrompt', () => {
  it('builds a prompt with required placeholders resolved', () => {
    const prompt = buildReviewPrompt({
      githubRunUrl: 'https://github.com/example/repo/actions/runs/123'
    })

    expect(prompt).toContain('GitHub run: https://github.com/example/repo/actions/runs/123')
    expect(prompt).toContain('- docs/decisions/')
    expect(prompt).toContain('run `pnpm run docs:validate` after your edits')
    expect(prompt).toContain(
      'Do not treat current frontmatter status alone as evidence that a doc still deserves to exist; re-evaluate from body content and current repo state without using this as a reason to delete durable decisions that still govern the repo.'
    )
    expect(prompt).not.toContain('__GITHUB_RUN_URL_BLOCK__')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('fails fast when a required prompt marker is removed', () => {
    expect(() =>
      buildReviewPrompt({
        githubRunUrl: 'https://github.com/example/repo/actions/runs/123',
        template: 'Review controlled docs only.'
      })
    ).toThrow('Prompt template is missing required marker(s):')
  })
})

describe('ctx/topic helpers', () => {
  it('builds the ctx command from the Takopi project alias', () => {
    expect(buildCtxCommand({ takopiProjectAlias: '/takopi-project' })).toBe(
      '/ctx set takopi-project'
    )
  })

  it('builds a deterministic topic title from the timestamp', () => {
    expect(
      buildTopicTitle({
        prefix: 'Docs Audit',
        now: new Date('2026-03-14T02:00:00.000Z')
      })
    ).toBe('Docs Audit 2026-03-14 02:00 UTC')
  })

  it('waits for the default Telegram group pacing window', async () => {
    const originalSetTimeout = globalThis.setTimeout
    const setTimeoutSpy = vi.fn((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler()
      }
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    globalThis.setTimeout = setTimeoutSpy as typeof setTimeout

    try {
      await waitForTelegramRateLimitWindow()
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000)
  })
})

describe('run', () => {
  it('creates a topic, sends /ctx, then sends the prompt into that topic', async () => {
    const requestBodies: string[] = []
    const sleepCalls: number[] = []
    const request = vi.fn((url, options, callback) => {
      expect(options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      const responseHandlers: Record<string, (value?: string) => void> = {}
      const response = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          responseHandlers[event] = handler
        })
      }

      callback(response)

      return {
        on: vi.fn(),
        write: vi.fn((chunk) => {
          requestBodies.push(`${url} ${String(chunk)}`)
        }),
        end: vi.fn(() => {
          const isCreateForumTopic = String(url).endsWith('/createForumTopic')
          responseHandlers.data?.(
            isCreateForumTopic
              ? '{"ok":true,"result":{"message_thread_id":42,"name":"Docs Audit 2026-03-14 02:00 UTC"}}'
              : '{"ok":true,"result":{"message_id":99}}'
          )
          responseHandlers.end?.()
        })
      }
    })

    await run({
      env: {
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: 'chat-id',
        TAKOPI_PROJECT_ALIAS: 'takopi-project',
        GITHUB_RUN_URL: 'https://github.com/example/repo/actions/runs/123',
        DOCS_AUDIT_NOW: '2026-03-14T02:00:00.000Z'
      },
      request,
      waitForTelegramRateLimitWindow: async (delayMs = 3000) => {
        sleepCalls.push(delayMs)
      }
    })

    expect(request).toHaveBeenCalledTimes(3)
    expect(sleepCalls).toEqual([3000, 3000])

    const [topicRequest, ctxRequest, promptRequest] = requestBodies

    expect(topicRequest).toContain('/createForumTopic')
    const topicParams = new URLSearchParams(topicRequest.split(' ')[1])
    expect(topicParams.get('chat_id')).toBe('chat-id')
    expect(topicParams.get('name')).toBe('Docs Audit 2026-03-14 02:00 UTC')

    expect(ctxRequest).toContain('/sendMessage')
    const ctxParams = new URLSearchParams(ctxRequest.split(' ')[1])
    expect(ctxParams.get('chat_id')).toBe('chat-id')
    expect(ctxParams.get('message_thread_id')).toBe('42')
    expect(ctxParams.get('text')).toBe('/ctx set takopi-project')

    expect(promptRequest).toContain('/sendMessage')
    const promptParams = new URLSearchParams(promptRequest.split(' ')[1])
    expect(promptParams.get('chat_id')).toBe('chat-id')
    expect(promptParams.get('message_thread_id')).toBe('42')
    expect(promptParams.get('text')).toContain('GitHub run: https://github.com/example/repo/actions/runs/123')
    expect(promptParams.get('text')).not.toContain('__GITHUB_RUN_URL_BLOCK__')
  })
})
