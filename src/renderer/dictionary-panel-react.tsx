/*
Where: src/renderer/dictionary-panel-react.tsx
What: Dictionary CRUD panel for correction.dictionary entries.
Why: Expose app-level user dictionary add/update/remove flows in a dedicated tab.
*/

import { useMemo, useState } from 'react'
import type { DictionaryEntry, Settings } from '../shared/domain'

interface DictionaryPanelReactProps {
  settings: Settings
  onUpsertEntry: (key: string, value: string) => void
  onDeleteEntry: (key: string) => void
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

export const DictionaryPanelReact = ({ settings, onUpsertEntry, onDeleteEntry }: DictionaryPanelReactProps) => {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newEntryError, setNewEntryError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})

  const entries = useMemo(
    () => [...settings.correction.dictionary.entries].sort(compareDictionaryEntries),
    [settings.correction.dictionary.entries]
  )

  const resolveDraftValue = (entry: DictionaryEntry): string =>
    Object.prototype.hasOwnProperty.call(draftValues, entry.key) ? draftValues[entry.key]! : entry.value

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

    onUpsertEntry(key, value)
    setNewKey('')
    setNewValue('')
    setNewEntryError(null)
  }

  const saveRow = (entry: DictionaryEntry) => {
    const draft = resolveDraftValue(entry).trim()
    if (draft.length === 0) {
      setRowErrors((prev) => ({ ...prev, [entry.key]: 'Value is required.' }))
      return
    }
    if (draft.length > MAX_VALUE_LENGTH) {
      setRowErrors((prev) => ({ ...prev, [entry.key]: `Value must be ${MAX_VALUE_LENGTH} characters or fewer.` }))
      return
    }

    onUpsertEntry(entry.key, draft)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[entry.key]
      return next
    })
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
          <ul className="m-0 p-0 list-none space-y-2">
            {entries.map((entry, index) => (
              <li key={entry.key} className="rounded border border-border/70 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-24 text-[10px] text-muted-foreground font-mono">{entry.key}</span>
                  <input
                    id={`dictionary-value-${index}`}
                    value={resolveDraftValue(entry)}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setDraftValues((prev) => ({ ...prev, [entry.key]: nextValue }))
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
                    id={`dictionary-save-${index}`}
                    type="button"
                    className="h-8 rounded border border-border bg-secondary px-2 text-xs"
                    onClick={() => { saveRow(entry) }}
                  >
                    Save
                  </button>
                  <button
                    id={`dictionary-delete-${index}`}
                    type="button"
                    className="h-8 rounded border border-border bg-secondary px-2 text-xs text-destructive"
                    aria-label={`Delete dictionary entry ${entry.key}`}
                    onClick={() => {
                      setDraftValues((prev) => {
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
        )}
      </section>
    </section>
  )
}
