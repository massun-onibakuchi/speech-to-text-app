/*
Where: src/renderer/dictionary-panel-react.tsx
What: Dictionary CRUD panel for correction.dictionary entries.
Why: Expose app-level user dictionary add/update/remove flows in a dedicated tab.
*/

import { useEffect, useMemo, useState, type FocusEvent } from 'react'
import type { DictionaryEntry, Settings } from '../shared/domain'

interface DictionaryPanelReactProps {
  settings: Settings
  onAddEntry: (key: string, value: string) => void
  onUpdateEntry: (originalKey: string, nextKey: string, nextValue: string) => Promise<boolean>
  onDeleteEntry: (key: string) => void
}

interface DictionaryRowDraft {
  key: string
  value: string
}

const MAX_VALUE_LENGTH = 256
const MAX_KEY_LENGTH = 128

const compareDictionaryEntries = (left: DictionaryEntry, right: DictionaryEntry): number => {
  const a = left.key.toLowerCase()
  const b = right.key.toLowerCase()
  if (a < b) return -1
  if (a > b) return 1
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
}

export const DictionaryPanelReact = ({ settings, onAddEntry, onUpdateEntry, onDeleteEntry }: DictionaryPanelReactProps) => {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newEntryError, setNewEntryError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [rowDrafts, setRowDrafts] = useState<Record<string, DictionaryRowDraft>>({})

  const entries = useMemo(
    () => [...settings.correction.dictionary.entries].sort(compareDictionaryEntries),
    [settings.correction.dictionary.entries]
  )

  useEffect(() => {
    setRowDrafts((prev) => {
      const nextDrafts: Record<string, DictionaryRowDraft> = {}
      for (const entry of entries) {
        nextDrafts[entry.key] = prev[entry.key] ?? {
          key: entry.key,
          value: entry.value
        }
      }
      return nextDrafts
    })
    setRowErrors((prev) => {
      const nextErrors: Record<string, string> = {}
      for (const entry of entries) {
        if (prev[entry.key]) {
          nextErrors[entry.key] = prev[entry.key]!
        }
      }
      return nextErrors
    })
  }, [entries])

  const resolveRowDraft = (entry: DictionaryEntry): DictionaryRowDraft =>
    rowDrafts[entry.key] ?? {
      key: entry.key,
      value: entry.value
    }

  const addEntry = () => {
    const key = newKey.trim()
    const value = newValue.trim()
    if (key.length === 0) {
      setNewEntryError('Key is required.')
      return
    }
    if (key.length > MAX_KEY_LENGTH) {
      setNewEntryError(`Key must be ${MAX_KEY_LENGTH} characters or fewer.`)
      return
    }
    if (value.length === 0) {
      setNewEntryError('Value is required.')
      return
    }
    if (value.length > MAX_VALUE_LENGTH) {
      setNewEntryError(`Value must be ${MAX_VALUE_LENGTH} characters or fewer.`)
      return
    }
    if (entries.some((entry) => entry.key.toLowerCase() === key.toLowerCase())) {
      setNewEntryError('Key already exists (case-insensitive).')
      return
    }

    onAddEntry(key, value)
    setNewKey('')
    setNewValue('')
    setNewEntryError(null)
  }

  const validateRowDraft = (originalKey: string, draft: DictionaryRowDraft): string | null => {
    const normalizedKey = draft.key.trim()
    const normalizedValue = draft.value.trim()

    if (normalizedKey.length === 0) {
      return 'Key is required.'
    }
    if (normalizedKey.length > MAX_KEY_LENGTH) {
      return `Key must be ${MAX_KEY_LENGTH} characters or fewer.`
    }
    if (normalizedValue.length === 0) {
      return 'Value is required.'
    }
    if (normalizedValue.length > MAX_VALUE_LENGTH) {
      return `Value must be ${MAX_VALUE_LENGTH} characters or fewer.`
    }
    if (
      entries.some(
        (entry) => entry.key !== originalKey && entry.key.toLowerCase() === normalizedKey.toLowerCase()
      )
    ) {
      return 'Key already exists (case-insensitive).'
    }

    return null
  }

  const commitRowDraft = async (entry: DictionaryEntry): Promise<void> => {
    const draft = resolveRowDraft(entry)
    const validationError = validateRowDraft(entry.key, draft)
    if (validationError) {
      setRowErrors((prev) => ({ ...prev, [entry.key]: validationError }))
      return
    }

    const normalizedKey = draft.key.trim()
    const normalizedValue = draft.value.trim()
    if (normalizedKey === entry.key && normalizedValue === entry.value) {
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[entry.key]
        return next
      })
      return
    }

    const saved = await onUpdateEntry(entry.key, normalizedKey, normalizedValue)
    if (!saved) {
      return
    }
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[entry.key]
      return next
    })
  }

  const handleRowBlur = (entry: DictionaryEntry) => async (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }
    await commitRowDraft(entry)
  }

  return (
    <section className="p-4 space-y-4">
      <section className="rounded border border-border bg-card p-3 space-y-3">
        <h3 className="text-xs font-semibold m-0">Add dictionary entry</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input
            id="dictionary-new-key"
            value={newKey}
            onChange={(event) => {
              setNewKey(event.target.value)
              setNewEntryError(null)
            }}
            className="h-8 rounded border border-input bg-input px-2 text-xs"
            placeholder="key"
            aria-label="Dictionary key"
            maxLength={MAX_KEY_LENGTH}
          />
          <input
            id="dictionary-new-value"
            value={newValue}
            onChange={(event) => {
              setNewValue(event.target.value)
              setNewEntryError(null)
            }}
            className="h-8 rounded border border-input bg-input px-2 text-xs"
            placeholder="value"
            aria-label="Dictionary value"
            maxLength={MAX_VALUE_LENGTH}
          />
          <button
            id="dictionary-add"
            type="button"
            className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground"
            onClick={addEntry}
          >
            Add
          </button>
        </div>
        {newEntryError ? <p className="text-[10px] text-destructive m-0" aria-live="polite">{newEntryError}</p> : null}
      </section>

      <section className="rounded border border-border bg-card p-3 space-y-2">
        <h3 className="text-xs font-semibold m-0">Dictionary entries</h3>
        {entries.length === 0 ? (
          <p className="text-[10px] text-muted-foreground m-0">No dictionary entries yet.</p>
        ) : (
          <div className="space-y-2">
            <div
              data-testid="dictionary-entry-header"
              className="grid grid-cols-[minmax(6rem,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded border border-border/60 bg-muted/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground"
            >
              <span>Replace</span>
              <span>With</span>
              <span aria-hidden="true" />
            </div>
            <ul className="m-0 p-0 list-none space-y-2">
              {entries.map((entry, index) => (
                <li key={entry.key} className="rounded border border-border/70 p-2 space-y-1">
                  <div className="flex items-center gap-2" onBlur={handleRowBlur(entry)}>
                    <input
                      id={`dictionary-key-${index}`}
                      value={resolveRowDraft(entry).key}
                      onChange={(event) => {
                        const nextKey = event.target.value
                        setRowDrafts((prev) => ({
                          ...prev,
                          [entry.key]: {
                            ...(prev[entry.key] ?? { key: entry.key, value: entry.value }),
                            key: nextKey
                          }
                        }))
                        setRowErrors((prev) => {
                          const next = { ...prev }
                          delete next[entry.key]
                          return next
                        })
                      }}
                      className="h-8 min-w-24 rounded border border-input bg-input px-2 text-xs font-mono text-muted-foreground"
                      aria-label={`Key for ${entry.key}`}
                      maxLength={MAX_KEY_LENGTH}
                    />
                    <input
                      id={`dictionary-value-${index}`}
                      value={resolveRowDraft(entry).value}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setRowDrafts((prev) => ({
                          ...prev,
                          [entry.key]: {
                            ...(prev[entry.key] ?? { key: entry.key, value: entry.value }),
                            value: nextValue
                          }
                        }))
                        setRowErrors((prev) => {
                          const next = { ...prev }
                          delete next[entry.key]
                          return next
                        })
                      }}
                      className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs"
                      aria-label={`Value for ${entry.key}`}
                      maxLength={MAX_VALUE_LENGTH}
                    />
                    <button
                      id={`dictionary-delete-${index}`}
                      type="button"
                      className="h-8 rounded border border-border bg-secondary px-2 text-xs text-destructive"
                      aria-label={`Delete dictionary entry ${entry.key}`}
                      onClick={() => {
                        setRowDrafts((prev) => {
                          const next = { ...prev }
                          delete next[entry.key]
                          return next
                        })
                        setRowErrors((prev) => {
                          const next = { ...prev }
                          delete next[entry.key]
                          return next
                        })
                        onDeleteEntry(entry.key)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {rowErrors[entry.key] ? <p className="text-[10px] text-destructive m-0" aria-live="polite">{rowErrors[entry.key]}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </section>
  )
}
