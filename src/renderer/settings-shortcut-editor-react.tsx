/*
Where: src/renderer/settings-shortcut-editor-react.tsx
What: React-rendered editable shortcut fields inside the Settings form.
Why: Continue Settings migration by moving shortcut input event ownership to React.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
import { canonicalizeShortcutForDuplicateCheck, formatShortcutFromKeyboardEvent } from './shortcut-capture'

type ShortcutKey =
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

interface SettingsShortcutEditorReactProps {
  settings: Settings
  validationErrors: Partial<Record<ShortcutKey, string>>
  onChangeShortcutDraft: (key: ShortcutKey, value: string) => void
  onCaptureStateChange?: (isActive: boolean) => void
}

interface ShortcutFieldConfig {
  key: ShortcutKey
  label: string
  inputId: string
  errorId: string
}

type ShortcutCaptureState =
  | { status: 'idle' }
  | { status: 'recording' | 'canceled' | 'committed' | 'error'; fieldId: ShortcutKey }

const SHORTCUT_FIELDS: readonly ShortcutFieldConfig[] = [
  {
    key: 'toggleRecording',
    label: 'Toggle recording shortcut',
    inputId: 'settings-shortcut-toggle-recording',
    errorId: 'settings-error-toggle-recording'
  },
  {
    key: 'cancelRecording',
    label: 'Cancel recording shortcut',
    inputId: 'settings-shortcut-cancel-recording',
    errorId: 'settings-error-cancel-recording'
  },
  {
    key: 'runTransform',
    label: 'Run transform shortcut',
    inputId: 'settings-shortcut-run-transform',
    errorId: 'settings-error-run-transform'
  },
  {
    key: 'runTransformOnSelection',
    label: 'Run transform on selection shortcut',
    inputId: 'settings-shortcut-run-transform-selection',
    errorId: 'settings-error-run-transform-selection'
  },
  {
    key: 'pickTransformation',
    label: 'Pick transformation shortcut',
    inputId: 'settings-shortcut-pick-transform',
    errorId: 'settings-error-pick-transform'
  },
  {
    key: 'changeTransformationDefault',
    label: 'Change default transformation shortcut',
    inputId: 'settings-shortcut-change-default-transform',
    errorId: 'settings-error-change-default-transform'
  }
]

const buildShortcutDraftFromSettings = (settings: Settings): Record<ShortcutKey, string> => ({
  toggleRecording: settings.shortcuts.toggleRecording ?? DEFAULT_SETTINGS.shortcuts.toggleRecording,
  cancelRecording: settings.shortcuts.cancelRecording ?? DEFAULT_SETTINGS.shortcuts.cancelRecording,
  runTransform: settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform,
  runTransformOnSelection: settings.shortcuts.runTransformOnSelection ?? DEFAULT_SETTINGS.shortcuts.runTransformOnSelection,
  pickTransformation: settings.shortcuts.pickTransformation ?? DEFAULT_SETTINGS.shortcuts.pickTransformation,
  changeTransformationDefault: settings.shortcuts.changeTransformationDefault ?? DEFAULT_SETTINGS.shortcuts.changeTransformationDefault
})

export const SettingsShortcutEditorReact = ({
  settings,
  validationErrors,
  onChangeShortcutDraft,
  onCaptureStateChange
}: SettingsShortcutEditorReactProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onCaptureStateChangeRef = useRef(onCaptureStateChange)
  const lastCaptureActiveRef = useRef(false)
  const [shortcutDraft, setShortcutDraft] = useState<Record<ShortcutKey, string>>(buildShortcutDraftFromSettings(settings))
  const [captureState, setCaptureState] = useState<ShortcutCaptureState>({ status: 'idle' })
  const [captureErrors, setCaptureErrors] = useState<Partial<Record<ShortcutKey, string>>>({})
  const inputRefs = useRef<Partial<Record<ShortcutKey, HTMLInputElement | null>>>({})
  const capturingKey = captureState.status === 'recording' ? captureState.fieldId : null

  useEffect(() => {
    setShortcutDraft(buildShortcutDraftFromSettings(settings))
    setCaptureState({ status: 'idle' })
    setCaptureErrors({})
  }, [
    settings.shortcuts.toggleRecording,
    settings.shortcuts.cancelRecording,
    settings.shortcuts.runTransform,
    settings.shortcuts.runTransformOnSelection,
    settings.shortcuts.pickTransformation,
    settings.shortcuts.changeTransformationDefault
  ])

  useEffect(() => {
    onCaptureStateChangeRef.current = onCaptureStateChange
  }, [onCaptureStateChange])

  useEffect(
    () => {
      const isCaptureActive = capturingKey !== null
      if (lastCaptureActiveRef.current === isCaptureActive) {
        return
      }
      lastCaptureActiveRef.current = isCaptureActive
      onCaptureStateChangeRef.current?.(isCaptureActive)
    },
    [capturingKey]
  )

  const beginCapture = (key: ShortcutKey): void => {
    setCaptureState({ status: 'recording', fieldId: key })
    setCaptureErrors({})
  }

  const cancelCapture = useCallback((): void => {
    setCaptureState((previous) => {
      if (previous.status === 'recording') {
        return { status: 'canceled', fieldId: previous.fieldId }
      }
      return { status: 'idle' }
    })
  }, [])

  useEffect(() => {
    if (capturingKey === null) {
      return
    }

    const cancelIfOutsideContainer = (target: EventTarget | null): void => {
      const container = containerRef.current
      if (!container) {
        cancelCapture()
        return
      }
      if (target instanceof Node && container.contains(target)) {
        return
      }
      cancelCapture()
    }

    const onPointerDown = (event: PointerEvent): void => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : []
      const clickedInside =
        path.some((entry) => entry instanceof Node && containerRef.current?.contains(entry)) ||
        (event.target instanceof Node && containerRef.current?.contains(event.target))
      if (!clickedInside) {
        cancelCapture()
      }
    }

    const onFocusIn = (event: FocusEvent): void => {
      cancelIfOutsideContainer(event.target)
    }

    const onWindowBlur = (): void => {
      cancelCapture()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [capturingKey, cancelCapture])

  const handleCaptureKeydown = (key: ShortcutKey, event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (capturingKey !== key) {
      return
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === 'Tab') {
      setCaptureState({ status: 'canceled', fieldId: key })
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setCaptureState({ status: 'canceled', fieldId: key })
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const { combo, error } = formatShortcutFromKeyboardEvent(event)
    if (!combo) {
      setCaptureErrors((previous) => ({
        ...previous,
        [key]: error ?? 'Shortcut capture failed.'
      }))
      return
    }

    const canonicalCombo = canonicalizeShortcutForDuplicateCheck(combo)
    const duplicateKey = (Object.keys(shortcutDraft) as ShortcutKey[]).find((candidate) => {
      if (candidate === key) {
        return false
      }
      return canonicalizeShortcutForDuplicateCheck(shortcutDraft[candidate]) === canonicalCombo
    })

    if (duplicateKey) {
      setCaptureErrors((previous) => ({
        ...previous,
        [key]: `Shortcut "${combo}" is already assigned.`
      }))
      return
    }

    setShortcutDraft((previous) => ({
      ...previous,
      [key]: combo
    }))
    setCaptureErrors((previous) => ({
      ...previous,
      [key]: ''
    }))
    onChangeShortcutDraft(key, combo)
    setCaptureState({ status: 'committed', fieldId: key })
  }

  return (
    <div className="space-y-3" ref={containerRef}>
      {SHORTCUT_FIELDS.map((field) => (
        <div className="space-y-1.5" key={field.key}>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1.5 text-xs">
              <span>{field.label}</span>
              <input
                id={field.inputId}
                type="text"
                className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
                value={shortcutDraft[field.key]}
                readOnly
                ref={(element) => {
                  inputRefs.current[field.key] = element
                }}
                onClick={() => {
                  beginCapture(field.key)
                }}
                onKeyDown={(event) => {
                  handleCaptureKeydown(field.key, event)
                }}
                onBlur={() => {
                  if (capturingKey === field.key) {
                    cancelCapture()
                  }
                }}
                aria-describedby={field.errorId}
                data-shortcut-capturing={capturingKey === field.key ? 'true' : 'false'}
              />
            </label>
            <button
              type="button"
              className="h-8 rounded border border-input bg-background px-2 text-[11px] font-medium hover:bg-accent"
              onClick={() => {
                if (capturingKey === field.key) {
                  cancelCapture()
                  return
                }
                beginCapture(field.key)
                inputRefs.current[field.key]?.focus()
              }}
              data-shortcut-capture-toggle={field.key}
            >
              {capturingKey === field.key ? 'Cancel' : 'Record'}
            </button>
          </div>
          {capturingKey === field.key && (
            <p className="text-[10px] text-primary" data-shortcut-capture-hint={field.key}>
              Recording... press a key combination with at least one modifier.
            </p>
          )}
          <p className="min-h-4 text-[10px] text-destructive" id={field.errorId}>
            {captureErrors[field.key] || validationErrors[field.key] || ''}
          </p>
        </div>
      ))}
    </div>
  )
}
