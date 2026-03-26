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

const SCRATCH_DRAFT_SAVE_DEBOUNCE_MS = 180

let appRoot: Root | null = null

const ScratchSpaceApp = () => {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState('')
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
    setNotice('')

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
      setNotice('')
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(60,180,120,0.22),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0))] bg-background px-4 py-4 text-foreground">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden rounded-[1.4rem] border border-white/8 bg-[rgba(11,14,19,0.94)] shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="flex flex-1 flex-col gap-4 p-4">
          <section className="flex min-h-0 flex-1 flex-col rounded-[1.1rem] border border-white/8 bg-black/15 p-3">
            <textarea
              ref={textareaRef}
              id="scratch-space-draft"
              value={draft}
              onChange={(event) => {
                applyDraft(event.target.value)
                setError('')
              }}
              placeholder="Type here or dictate into the draft window."
              className="min-h-0 flex-1 resize-none rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
            />
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{draft.trim().length === 0 ? 'Draft is empty.' : `${draft.length} characters saved locally.`}</span>
              <span>{settings.transformation.presets.length} profile{settings.transformation.presets.length === 1 ? '' : 's'}</span>
            </div>
          </section>

          <aside className="rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.015))] p-3">
            <div id="scratch-space-profile-list" role="radiogroup" className="flex flex-col gap-2">
              {settings.transformation.presets.map((preset) => {
                const isSelected = preset.id === selectedPresetId
                return (
                  <label
                    key={preset.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-[0.95rem] border px-3 py-3 transition ${
                      isSelected
                        ? 'border-primary/60 bg-[rgba(60,180,120,0.12)]'
                        : 'border-white/8 bg-black/18 hover:border-white/16'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scratch-space-profile"
                      value={preset.id}
                      checked={isSelected}
                      onChange={(event) => setSelectedPresetId(event.target.value)}
                      className="size-4 accent-[rgb(60,180,120)]"
                    />
                    <span className="text-sm text-foreground">{preset.name}</span>
                  </label>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                void runTransformation()
              }}
              disabled={isBusy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[0.95rem] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <WandSparkles className="size-4" />
              Transform and paste
            </button>

            <div className="mt-3 rounded-[0.95rem] border border-white/8 bg-black/18 px-3 py-3 text-[11px] leading-5">
              {notice ? <p className="text-muted-foreground">{notice}</p> : null}
              {error ? <p className="mt-2 text-destructive">{error}</p> : null}
            </div>
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
