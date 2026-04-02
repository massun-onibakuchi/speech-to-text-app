/*
Where: src/renderer/scratch-space-app.test.tsx
What: Renderer tests for the floating scratch-space popup flow.
Why: Guard popup-specific keyboard behavior, default profile selection, draft restore,
     and successful execute/close semantics independently from the main app shell.
*/

// @vitest-environment jsdom

import { act } from 'react'
import type { IpcApi } from '../shared/ipc'
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
    let onOpenScratchSpaceListener: (() => void) | null = null
    let onSettingsUpdatedListener: (() => void) | null = null

    const api: IpcApi = {
      ping: async () => 'pong',
      getSettings: async () => structuredClone(settings),
      setSettings: async () => structuredClone(settings),
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: { kind: 'ready', message: 'Ollama is available.' },
        availableModels: [
          { id: 'qwen3.5:2b', label: 'qwen3.5:2b' },
          { id: 'qwen3.5:4b', label: 'qwen3.5:4b' }
        ],
        selectedModelId: settings.cleanup.localModelId,
        selectedModelInstalled: true
      }),
      getApiKeyStatus: async () => ({ groq: true, elevenlabs: true, google: true }),
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
      onOpenScratchSpace: vi.fn((listener: () => void) => {
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
      emitOpenScratchSpace: () => {
        onOpenScratchSpaceListener?.()
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
      harness.emitOpenScratchSpace()
      await flush()
    })

    const textarea = mountPoint.querySelector<HTMLTextAreaElement>('#scratch-space-draft')
    expect(defaultProfile?.getAttribute('data-state')).toBe('checked')
    expect(textarea?.value).toBe('reopened draft')
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
