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
import { type ScratchSpaceExecutionMode, type ScratchSpaceOpenPayload } from '../shared/ipc'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { cn } from './lib/utils'

const SCRATCH_DRAFT_SAVE_DEBOUNCE_MS = 180
const SCRATCH_MENU_ACTIONS = [
  {
    id: 'copy' as const,
    label: 'Copy transformed result',
    keyHint: 'Enter'
  },
  {
    id: 'paste' as const,
    label: 'Paste at front app',
    keyHint: '⌘+Enter'
  }
] as const

type ScratchMenuActionId = (typeof SCRATCH_MENU_ACTIONS)[number]['id']

let appRoot: Root | null = null

const ScratchSpaceApp = () => {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [isMiniMenuOpen, setIsMiniMenuOpen] = useState(false)
  const [selectedMenuAction, setSelectedMenuAction] = useState<ScratchMenuActionId>('copy')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const miniMenuRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitLockRef = useRef(false)
  const busyRef = useRef(false)

  const setBusyState = (nextBusy: boolean): void => {
    busyRef.current = nextBusy
    setIsBusy(nextBusy)
  }

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

  const focusMiniMenu = (): void => {
    requestAnimationFrame(() => {
      miniMenuRef.current?.focus()
    })
  }

  const closeMiniMenu = (options?: { restoreTextareaFocus?: boolean }): void => {
    setIsMiniMenuOpen(false)
    setSelectedMenuAction('copy')
    if (options?.restoreTextareaFocus !== false) {
      focusTextarea()
    }
  }

  const openMiniMenu = (): void => {
    if (window.electronPlatform !== 'darwin' || busyRef.current) {
      return
    }
    setSelectedMenuAction('copy')
    setIsMiniMenuOpen(true)
    focusMiniMenu()
  }

  const moveMenuSelection = (direction: 'up' | 'down'): void => {
    setSelectedMenuAction((current) => {
      const currentIndex = SCRATCH_MENU_ACTIONS.findIndex((action) => action.id === current)
      if (direction === 'up') {
        return currentIndex <= 0 ? current : SCRATCH_MENU_ACTIONS[currentIndex - 1].id
      }
      return currentIndex >= SCRATCH_MENU_ACTIONS.length - 1 ? current : SCRATCH_MENU_ACTIONS[currentIndex + 1].id
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

  const refreshBootstrap = async (options?: { keepDraft?: boolean; keepSelection?: boolean }): Promise<void> => {
    const [nextSettings, nextDraft] = await Promise.all([
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getScratchSpaceDraft()
    ])
    setSettings(nextSettings)
    setIsMiniMenuOpen(false)
    setSelectedMenuAction('copy')
    if (!options?.keepSelection) {
      resetSelectionToDefault(nextSettings)
    }
    if (!options?.keepDraft) {
      draftRef.current = nextDraft
      setDraft(nextDraft)
    }
    focusTextarea()
  }

  const runTransformation = async (executionMode: ScratchSpaceExecutionMode = 'paste'): Promise<void> => {
    if (!settings || submitLockRef.current) {
      return
    }

    submitLockRef.current = true
    setBusyState(true)
    setError('')

    try {
      await persistDraftNow(draftRef.current)
      const result = await window.speechToTextApi.runScratchSpaceTransformation({
        text: draftRef.current,
        presetId: selectedPresetId,
        executionMode
      })
      if (result.status === 'error') {
        closeMiniMenu()
        setError(result.message)
        return
      }

      setIsMiniMenuOpen(false)
      setSelectedMenuAction('copy')
      draftRef.current = ''
      setDraft('')
      setError('')
    } finally {
      submitLockRef.current = false
      setBusyState(false)
    }
  }

  useEffect(() => {
    void refreshBootstrap()

    const unlistenSettingsUpdated = window.speechToTextApi.onSettingsUpdated(() => {
      void refreshBootstrap({ keepDraft: true })
    })
    const unlistenOpenScratchSpace = window.speechToTextApi.onOpenScratchSpace((payload: ScratchSpaceOpenPayload) => {
      const keepCurrentState = payload.reason === 'retry'
      if (keepCurrentState) {
        submitLockRef.current = false
        setBusyState(false)
      }
      void refreshBootstrap({
        keepDraft: keepCurrentState,
        keepSelection: keepCurrentState
      })
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
      if (window.electronPlatform === 'darwin' && event.metaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (isMiniMenuOpen) {
          closeMiniMenu()
        } else {
          openMiniMenu()
        }
        return
      }

      if (isMiniMenuOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeMiniMenu()
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          moveMenuSelection('up')
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          moveMenuSelection('down')
          return
        }

        if (event.key === 'Enter' && event.metaKey) {
          event.preventDefault()
          void runTransformation('paste')
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          void runTransformation(selectedMenuAction === 'copy' ? 'copy' : 'paste')
          return
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        if (busyRef.current) {
          return
        }
        void persistDraftNow(draftRef.current).then(async () => {
          await window.speechToTextApi.hideScratchSpaceWindow()
        })
        return
      }

      if (event.key === 'Enter' && event.metaKey) {
        event.preventDefault()
        void runTransformation('paste')
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
  }, [isMiniMenuOpen, selectedMenuAction, selectedPresetId, settings])

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading scratch space…</p>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-background p-1.5 text-foreground">
      <div className="relative mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex flex-1 flex-col gap-1.5 p-1.5">
          <section
            data-testid="scratch-space-draft-panel"
            className="flex min-h-[220px] flex-1 flex-col rounded-md border border-border bg-background p-2.5"
          >
            <textarea
              ref={textareaRef}
              id="scratch-space-draft"
              value={draft}
              onChange={(event) => {
                applyDraft(event.target.value)
                setError('')
              }}
              disabled={isBusy}
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
              onValueChange={(nextValue) => {
                if (!busyRef.current) {
                  setSelectedPresetId(nextValue)
                }
              }}
              className="gap-2"
            >
              {settings.transformation.presets.map((preset) => {
                const isSelected = preset.id === selectedPresetId
                return (
                  <div
                    key={preset.id}
                    onClick={() => {
                      if (!busyRef.current) {
                        setSelectedPresetId(preset.id)
                      }
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                      isBusy && 'cursor-not-allowed opacity-60',
                      isSelected
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:bg-accent'
                    )}
                    aria-disabled={isBusy}
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

        {window.electronPlatform === 'darwin' && isMiniMenuOpen ? (
          <div
            ref={miniMenuRef}
            tabIndex={-1}
            data-testid="scratch-space-mini-menu"
            className="absolute right-4 bottom-4 z-20 w-64 rounded-xl border border-white/15 bg-white/10 p-2 text-foreground shadow-2xl backdrop-blur-md outline-none"
            onBlur={(event) => {
              const nextFocused = event.relatedTarget
              if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
                return
              }
              closeMiniMenu()
            }}
          >
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Scratch menu
            </p>
            <div className="space-y-1">
              {SCRATCH_MENU_ACTIONS.map((action) => {
                const isSelected = action.id === selectedMenuAction
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={`scratch-space-mini-menu-${action.id}`}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition',
                      isSelected ? 'bg-white/14 text-foreground' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'
                    )}
                    onFocus={() => {
                      setSelectedMenuAction(action.id)
                    }}
                    onClick={() => {
                      void runTransformation(action.id === 'copy' ? 'copy' : 'paste')
                    }}
                  >
                    <span className="text-xs">{action.label}</span>
                    <span className="rounded-md border border-white/15 bg-black/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {action.keyHint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
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
