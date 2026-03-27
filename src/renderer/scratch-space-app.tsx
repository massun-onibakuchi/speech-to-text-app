/*
Where: src/renderer/scratch-space-app.tsx
What: Floating scratch-space popup renderer for drafting, dictating, transforming, and pasting.
Why: Keep the new popup isolated from the main settings shell while reusing the same
     preload API, theme tokens, and transformation-profile settings.
*/

import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { WandSparkles } from 'lucide-react'
import { type Settings } from '../shared/domain'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { cn } from './lib/utils'

const SCRATCH_DRAFT_SAVE_DEBOUNCE_MS = 180

let appRoot: Root | null = null

const ScratchSpaceApp = () => {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focusTextarea = (): void => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }

  const persistDraftNow = async (nextDraft: string): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await window.speechToTextApi.setScratchSpaceDraft(nextDraft)
  }

  const scheduleDraftSave = (nextDraft: string): void => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void window.speechToTextApi.setScratchSpaceDraft(nextDraft)
    }, SCRATCH_DRAFT_SAVE_DEBOUNCE_MS)
  }

  const applyDraft = (nextDraft: string, options?: { persist?: boolean }): void => {
    draftRef.current = nextDraft
    setDraft(nextDraft)
    if (options?.persist !== false) {
      scheduleDraftSave(nextDraft)
    }
  }

  const resetSelectionToDefault = (nextSettings: Settings): void => {
    const defaultPresetId = nextSettings.transformation.defaultPresetId
    const fallbackPresetId = nextSettings.transformation.presets[0]?.id ?? ''
    setSelectedPresetId(
      nextSettings.transformation.presets.some((preset) => preset.id === defaultPresetId)
        ? defaultPresetId
        : fallbackPresetId
    )
  }

  const refreshBootstrap = async (options?: { keepDraft?: boolean }): Promise<void> => {
    const [nextSettings, nextDraft] = await Promise.all([
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getScratchSpaceDraft()
    ])
    setSettings(nextSettings)
    resetSelectionToDefault(nextSettings)
    if (!options?.keepDraft) {
      draftRef.current = nextDraft
      setDraft(nextDraft)
    }
    focusTextarea()
  }

  const runTransformation = async (): Promise<void> => {
    if (!settings || isBusy) {
      return
    }

    setIsBusy(true)
    setError('')

    try {
      await persistDraftNow(draftRef.current)
      const result = await window.speechToTextApi.runScratchSpaceTransformation({
        text: draftRef.current,
        presetId: selectedPresetId
      })
      if (result.status === 'error') {
        setError(result.message)
        return
      }

      draftRef.current = ''
      setDraft('')
      setError('')
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBootstrap()

    const unlistenSettingsUpdated = window.speechToTextApi.onSettingsUpdated(() => {
      void refreshBootstrap({ keepDraft: true })
    })
    const unlistenOpenScratchSpace = window.speechToTextApi.onOpenScratchSpace(() => {
      void refreshBootstrap()
    })

    return () => {
      unlistenSettingsUpdated()
      unlistenOpenScratchSpace()
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void persistDraftNow(draftRef.current).then(async () => {
          await window.speechToTextApi.hideScratchSpaceWindow()
        })
        return
      }

      if (event.key === 'Enter' && event.metaKey) {
        event.preventDefault()
        void runTransformation()
      }
    }

    const onBlur = (): void => {
      void persistDraftNow(draftRef.current)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [isBusy, selectedPresetId, settings])

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading scratch space…</p>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-background p-1.5 text-foreground">
      <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex flex-1 flex-col gap-1.5 p-1.5">
          <section
            data-testid="scratch-space-draft-panel"
            className="flex min-h-[220px] flex-col rounded-md border border-border bg-background p-2.5"
          >
            <textarea
              ref={textareaRef}
              id="scratch-space-draft"
              value={draft}
              onChange={(event) => {
                applyDraft(event.target.value)
                setError('')
              }}
              placeholder="Draft here."
              className="min-h-[180px] flex-1 resize-none rounded-md border border-input bg-input px-3 py-3 font-mono text-xs leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="font-mono">{draft.length} chars</span>
              <span>{settings.transformation.presets.length} profile{settings.transformation.presets.length === 1 ? '' : 's'}</span>
            </div>
          </section>

          <aside
            data-testid="scratch-space-actions-panel"
            className="rounded-md border border-border bg-card px-2.5 pt-2.5 pb-0"
          >
            <RadioGroup
              id="scratch-space-profile-list"
              value={selectedPresetId}
              onValueChange={setSelectedPresetId}
              className="gap-2"
            >
              {settings.transformation.presets.map((preset) => {
                const isSelected = preset.id === selectedPresetId
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:bg-accent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value={preset.id}
                        id={`scratch-space-profile-${preset.id}`}
                        aria-label={preset.name}
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                      />
                      <span className="text-xs text-foreground">{preset.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{preset.provider}</span>
                  </div>
                )
              })}
            </RadioGroup>

            <button
              type="button"
              onClick={() => {
                void runTransformation()
              }}
              disabled={isBusy}
              className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <WandSparkles className="size-4" />
              Transform and paste
            </button>

            {error ? (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] text-destructive">
                {error}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}

export const startScratchSpaceApp = (target?: HTMLDivElement): void => {
  const mountPoint = target ?? document.querySelector<HTMLDivElement>('#app')
  if (!mountPoint) {
    return
  }

  if (!appRoot) {
    appRoot = createRoot(mountPoint)
  }

  appRoot.render(<ScratchSpaceApp />)
}

export const stopScratchSpaceAppForTests = (): void => {
  appRoot?.unmount()
  appRoot = null
}
