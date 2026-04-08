/*
Where: src/renderer/scratch-space-app.test.tsx
What: Renderer tests for the floating scratch-space popup flow.
Why: Guard popup-specific keyboard behavior, default profile selection, draft restore,
     and successful execute/close semantics independently from the main app shell.
*/

// @vitest-environment jsdom

import { act } from 'react'
import type { IpcApi, ScratchSpaceOpenPayload } from '../shared/ipc'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { startScratchSpaceApp, stopScratchSpaceAppForTests } from './scratch-space-app'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const waitForBoot = async (): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => {
      await flush()
    })
    const textarea = document.querySelector('#scratch-space-draft')
    const defaultProfile = document.querySelector<HTMLElement>('#scratch-space-profile-default')
    if (textarea && defaultProfile) {
      return
    }
  }
  throw new Error('Scratch space failed to boot.')
}

const setTextareaValue = (element: HTMLTextAreaElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('scratch-space-app', () => {
  afterEach(async () => {
    await act(async () => {
      stopScratchSpaceAppForTests()
    })
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  const buildApi = (overrides?: Partial<IpcApi>) => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'default', name: 'Default' },
      { ...settings.transformation.presets[0], id: 'alt', name: 'Alt profile' }
    ]
    settings.transformation.defaultPresetId = 'default'

    let scratchDraft = 'restored draft'
    let onOpenScratchSpaceListener: ((payload: ScratchSpaceOpenPayload) => void) | null = null
    let onSettingsUpdatedListener: (() => void) | null = null

    const api: IpcApi = {
      ping: async () => 'pong',
      getSettings: async () => structuredClone(settings),
      setSettings: async () => structuredClone(settings),
      getApiKeyStatus: async () => ({ groq: true, elevenlabs: true, google: true }),
      getLlmProviderStatus: async () => ({
        google: {
          provider: 'google',
          credential: { kind: 'api_key', configured: true },
          status: { kind: 'ready', message: 'Google API key is configured.' },
          models: [{ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', available: true }]
        },
        ollama: {
          provider: 'ollama',
          credential: { kind: 'local' },
          status: { kind: 'runtime_unavailable', message: 'Ollama is not installed.' },
          models: [{ id: 'qwen3.5:2b', label: 'qwen3.5:2b', available: false }]
        },
        'openai-subscription': {
          provider: 'openai-subscription',
          credential: { kind: 'cli', installed: true },
          status: {
            kind: 'cli_login_required',
            message: 'Codex CLI is installed but not signed in. Run `codex login` in your terminal, then refresh.'
          },
          models: [{ id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', available: false }]
        }
      }),
      connectLlmProvider: async () => {},
      disconnectLlmProvider: async () => {},
      setApiKey: async () => {},
      deleteApiKey: async () => {},
      testApiKeyConnection: async () => ({ provider: 'groq', status: 'success', message: 'ok' }),
      getHistory: async () => [],
      getAudioInputSources: async () => [],
      playSound: vi.fn(async () => {}),
      runRecordingCommand: async () => {},
      submitRecordedAudio: async () => {},
      getScratchSpaceDraft: vi.fn(async () => scratchDraft),
      setScratchSpaceDraft: vi.fn(async (draft: string) => {
        scratchDraft = draft
      }),
      transcribeScratchSpaceAudio: vi.fn(async () => ({
        status: 'ok' as const,
        message: 'Speech captured.',
        text: 'spoken draft'
      })),
      runScratchSpaceTransformation: vi.fn(async () => ({
        status: 'ok' as const,
        message: 'Scratch space pasted.',
        text: 'TRANSFORMED'
      })),
      hideScratchSpaceWindow: vi.fn(async () => {}),
      onRecordingCommand: vi.fn(() => () => {}),
      runPickTransformationFromClipboard: async () => {},
      onCompositeTransformStatus: vi.fn(() => () => {}),
      onHotkeyError: vi.fn(() => () => {}),
      onSettingsUpdated: vi.fn((listener: () => void) => {
        onSettingsUpdatedListener = listener
        return () => {
          onSettingsUpdatedListener = null
        }
      }),
      onOpenSettings: vi.fn(() => () => {}),
      onOpenScratchSpace: vi.fn((listener: (payload: ScratchSpaceOpenPayload) => void) => {
        onOpenScratchSpaceListener = listener
        return () => {
          onOpenScratchSpaceListener = null
        }
      }),
      ...overrides
    }

    return {
      api,
      setScratchDraft: (nextDraft: string) => {
        scratchDraft = nextDraft
      },
      emitOpenScratchSpace: (payload: ScratchSpaceOpenPayload = { reason: 'fresh' }) => {
        onOpenScratchSpaceListener?.(payload)
      },
      emitSettingsUpdated: () => {
        onSettingsUpdatedListener?.()
      }
    }
  }

  it('restores the draft, uses the default profile, and runs Cmd+Enter execution', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildApi()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    const defaultProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-default')
    expect(textarea?.value).toBe('restored draft')
    expect(defaultProfile?.getAttribute('data-state')).toBe('checked')

    await act(async () => {
      setTextareaValue(textarea!, 'hello from scratch')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      await flush()
    })

    expect(harness.api.runScratchSpaceTransformation).toHaveBeenCalledWith({
      text: 'hello from scratch',
      presetId: 'default'
    })
    expect(textarea?.value).toBe('')
  })

  it('saves the current draft and hides on Escape', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildApi()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    await act(async () => {
      setTextareaValue(textarea!, 'keep this draft')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
    })

    expect(harness.api.setScratchSpaceDraft).toHaveBeenLastCalledWith('keep this draft')
    expect(harness.api.hideScratchSpaceWindow).toHaveBeenCalledTimes(1)
  })

  it('resets the profile selection to default when scratch space is reopened', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildApi()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const defaultProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-default')
    const altProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-alt')
    await act(async () => {
      altProfile!.click()
      await flush()
    })
    expect(altProfile?.getAttribute('data-state')).toBe('checked')

    harness.setScratchDraft('reopened draft')
    await act(async () => {
      harness.emitOpenScratchSpace({ reason: 'fresh' })
      await flush()
    })

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    expect(defaultProfile?.getAttribute('data-state')).toBe('checked')
    expect(textarea?.value).toBe('reopened draft')
  })

  it('preserves the selected profile when scratch space reopens for retry', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildApi()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const defaultProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-default')
    const altProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-alt')
    await act(async () => {
      altProfile!.click()
      await flush()
    })
    expect(altProfile?.getAttribute('data-state')).toBe('checked')

    harness.setScratchDraft('retry draft')
    await act(async () => {
      harness.emitOpenScratchSpace({ reason: 'retry' })
      await flush()
    })

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    expect(altProfile?.getAttribute('data-state')).toBe('checked')
    expect(defaultProfile?.getAttribute('data-state')).not.toBe('checked')
    expect(textarea?.value).toBe('restored draft')
  })

  it('suppresses duplicate Cmd+Enter submits before the busy rerender lands', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    let resolveTransformation: (() => void) | null = null
    const harness = buildApi({
      runScratchSpaceTransformation: vi.fn(
        () =>
          new Promise<{ status: 'ok'; message: string; text: string }>((resolve) => {
            resolveTransformation = () => {
              resolve({
                status: 'ok' as const,
                message: 'Scratch space pasted.',
                text: 'TRANSFORMED'
              })
            }
          })
      )
    })
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    await act(async () => {
      setTextareaValue(textarea!, 'hello from scratch')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      await flush()
    })

    expect(harness.api.runScratchSpaceTransformation).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveTransformation?.()
      await flush()
    })
  })

  it('ignores Escape while a scratch-space execution is already in flight', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    let resolveTransformation: (() => void) | null = null
    const harness = buildApi({
      runScratchSpaceTransformation: vi.fn(
        () =>
          new Promise<{ status: 'ok'; message: string; text: string }>((resolve) => {
            resolveTransformation = () => {
              resolve({
                status: 'ok' as const,
                message: 'Scratch space pasted.',
                text: 'TRANSFORMED'
              })
            }
          })
      )
    })
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    await act(async () => {
      setTextareaValue(textarea!, 'hello from scratch')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
    })

    expect(harness.api.hideScratchSpaceWindow).not.toHaveBeenCalled()

    await act(async () => {
      resolveTransformation?.()
      await flush()
    })
  })

  it('re-enables the popup immediately when a retry reopen arrives before the failed invoke settles', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    let resolveTransformation: ((result: { status: 'error'; message: string; text: null }) => void) | null = null
    const harness = buildApi({
      runScratchSpaceTransformation: vi.fn(
        () =>
          new Promise<{ status: 'error'; message: string; text: null }>((resolve) => {
            resolveTransformation = resolve
          })
      )
    })
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    const altProfile = mountPoint.querySelector<HTMLElement>('#scratch-space-profile-alt')

    await act(async () => {
      setTextareaValue(textarea!, 'hello from scratch')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      await flush()
    })

    expect(textarea?.disabled).toBe(true)

    await act(async () => {
      harness.emitOpenScratchSpace({ reason: 'retry' })
      await flush()
    })

    expect(textarea?.disabled).toBe(false)
    await act(async () => {
      altProfile?.click()
      await flush()
    })
    expect(altProfile?.getAttribute('data-state')).toBe('checked')

    await act(async () => {
      resolveTransformation?.({
        status: 'error',
        message: 'Transformation failed.',
        text: null
      })
      await flush()
    })
  })

  it('uses a compact popup layout instead of stretching the draft panel to the full window height', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildApi()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    await act(async () => {
      startScratchSpaceApp(mountPoint)
    })
    await waitForBoot()

    const root = mountPoint.firstElementChild as HTMLElement | null
    const card = root?.firstElementChild as HTMLElement | null
    const draftPanel = mountPoint.querySelector<HTMLElement>('[data-testid="scratch-space-draft-panel"]')
    const actionsPanel = mountPoint.querySelector<HTMLElement>('[data-testid="scratch-space-actions-panel"]')

    expect(root?.className).toContain('h-screen')
    expect(card?.className).toContain('h-full')
    expect(card?.className).not.toContain('calc(100vh')
    expect(draftPanel?.className).toContain('min-h-[220px]')
    expect(draftPanel?.className).toContain('flex-1')
    expect(actionsPanel?.className).toContain('pb-0')
  })
})
