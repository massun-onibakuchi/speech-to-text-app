/*
 * Where: src/renderer/profiles-panel-react.tsx
 * What: Profiles panel tab — scrollable preset card list with inline-edit per STY-05.
 * Why: STY-05 full implementation replacing the STY-02 placeholder.
 *      Provides a compact card-per-preset view with hover-reveal actions (star/pencil/trash)
 *      and an inline edit form that avoids navigating away from the panel.
 *
 * Architecture notes:
 *   - "Default" preset = the one used for recording/transform shortcuts (defaultPresetId).
 *   - "Editing" preset = the card with the inline form open; editing is decoupled from
 *     default selection so opening edit does not change default behavior.
 *   - All edits are in-memory drafts until the user saves (matches SettingsTransformationReact behaviour).
 *   - Cancel discards local draft without persisting to disk.
 */

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import type { Settings, TransformationPreset } from '../shared/domain'
import type { SettingsValidationErrors } from './settings-validation'
import { cn } from './lib/utils'
import { SELECT_CONTROL_CLASS } from './select-control'

// Local draft type — mirrors editable fields from TransformationPreset.
interface EditDraft {
  name: string
  model: TransformationPreset['model']
  systemPrompt: string
  userPrompt: string
}

const buildDraft = (preset: TransformationPreset): EditDraft => ({
  name: preset.name,
  model: preset.model,
  systemPrompt: preset.systemPrompt,
  userPrompt: preset.userPrompt
})

// ---------------------------------------------------------------------------
// ProfilesPanelReact props
// ---------------------------------------------------------------------------

export interface ProfilesPanelReactProps {
  settings: Settings
  settingsValidationErrors: SettingsValidationErrors
  onSelectDefaultPreset: (presetId: string) => void | Promise<void>
  onSavePresetDraft: (
    presetId: string,
    draft: Pick<TransformationPreset, 'name' | 'model' | 'systemPrompt' | 'userPrompt'>
  ) => Promise<boolean>
  onAddPreset: () => void | Promise<void>
  onRemovePreset: (presetId: string) => void | Promise<void>
}

// ---------------------------------------------------------------------------
// ProfileCard — compact card shown for each preset
// ---------------------------------------------------------------------------

interface ProfileCardProps {
  preset: TransformationPreset
  isDefault: boolean
  isEditing: boolean
  onOpenEdit: () => void
  onSetDefault: () => void
  onRemove: () => void
}

const ProfileCard = ({ preset, isDefault, isEditing, onOpenEdit, onSetDefault, onRemove }: ProfileCardProps) => {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenEdit()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${preset.name} profile${isDefault ? ' (default)' : ''}`}
      aria-expanded={isEditing}
      onClick={onOpenEdit}
      onKeyDown={handleKeyDown}
      className={cn(
        'group/card relative flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isEditing
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:bg-accent/50'
      )}
    >
      {/* Card header row: name + badge + hover actions */}
      <div className="flex items-center justify-between gap-2 min-h-[1.5rem]">
        <span className="truncate text-sm font-medium">{preset.name}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Default badge — always visible when this is the default preset */}
          {isDefault && (
            <span className="mr-1 flex h-4 items-center rounded border border-primary/20 bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              default
            </span>
          )}
          {/* Hover-reveal action buttons (opacity-0 → group-hover/card:opacity-100) */}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
            {!isDefault && (
              <button
                type="button"
                aria-label={`Set ${preset.name} as default profile`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSetDefault()
                }}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star className="size-3" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Edit ${preset.name} profile`}
              onClick={(e) => {
                e.stopPropagation()
                onOpenEdit()
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${preset.name} profile`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Provider / model metadata footer — font-mono per spec section 6.4 */}
      <span className="font-mono text-[10px] text-muted-foreground">
        {preset.provider}/{preset.model}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProfileEditForm — inline edit form rendered below the editing card
// ---------------------------------------------------------------------------

interface ProfileEditFormProps {
  draft: EditDraft
  presetId: string
  presetNameError: string
  systemPromptError: string
  userPromptError: string
  onChangeDraft: (patch: Partial<EditDraft>) => void
  onSave: () => void
  onCancel: () => void
}

const ProfileEditForm = ({
  draft,
  presetId,
  presetNameError,
  systemPromptError,
  userPromptError,
  onChangeDraft,
  onSave,
  onCancel
}: ProfileEditFormProps) => (
  /* stopPropagation prevents card's onClick from firing when clicking form elements */
  <div
    className="mt-2 flex flex-col gap-2 border-t border-border/50 pt-2"
    onClick={(e) => { e.stopPropagation() }}
    role="presentation"
  >
    {/* Profile name — Input h-7 per spec */}
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground" htmlFor="profile-edit-name">
        Profile name
      </label>
      <input
        id="profile-edit-name"
        type="text"
        value={draft.name}
        aria-invalid={presetNameError.length > 0}
        aria-describedby={presetNameError ? `profile-edit-name-error-${presetId}` : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChangeDraft({ name: e.target.value })
        }}
        className="h-7 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {presetNameError && (
        <p id={`profile-edit-name-error-${presetId}`} className="text-[10px] text-destructive">{presetNameError}</p>
      )}
    </div>

    {/* Provider + Model — grid grid-cols-2 gap-2 Selects h-7 per spec */}
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground" htmlFor="profile-edit-provider">
          Provider
        </label>
        {/* Provider is currently always 'google' — read-only */}
        <select
          id="profile-edit-provider"
          value="google"
          disabled
          className={SELECT_CONTROL_CLASS}
        >
          <option value="google">google</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground" htmlFor="profile-edit-model">
          Model
        </label>
        <select
          id="profile-edit-model"
          value={draft.model}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            onChangeDraft({ model: e.target.value as TransformationPreset['model'] })
          }}
          className={SELECT_CONTROL_CLASS}
        >
          <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        </select>
      </div>
    </div>

    {/* System prompt — Textarea min-h-[60px] resize-none rows={3} per spec */}
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground" htmlFor="profile-edit-system-prompt">
        System prompt
      </label>
      <textarea
        id="profile-edit-system-prompt"
        rows={3}
        value={draft.systemPrompt}
        aria-invalid={systemPromptError.length > 0}
        aria-describedby={systemPromptError ? `profile-edit-system-prompt-error-${presetId}` : undefined}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChangeDraft({ systemPrompt: e.target.value })
        }}
        className="min-h-[60px] resize-none rounded border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {systemPromptError && (
        <p id={`profile-edit-system-prompt-error-${presetId}`} className="text-[10px] text-destructive">{systemPromptError}</p>
      )}
    </div>

    {/* User prompt — Input h-7 font-mono per spec */}
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground" htmlFor="profile-edit-user-prompt">
        User prompt <span className="opacity-60">(include {'{{text}}'})</span>
      </label>
      <input
        id="profile-edit-user-prompt"
        type="text"
        value={draft.userPrompt}
        aria-invalid={userPromptError.length > 0}
        aria-describedby={userPromptError ? `profile-edit-user-prompt-error-${presetId}` : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChangeDraft({ userPrompt: e.target.value })
        }}
        className="h-7 rounded border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {userPromptError && (
        <p id={`profile-edit-user-prompt-error-${presetId}`} className="text-[10px] text-destructive">{userPromptError}</p>
      )}
    </div>

    {/* Save / Cancel — Button size="sm" h-7 text-xs per spec */}
    <div className="flex items-center justify-end gap-1.5 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex h-7 items-center rounded border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        className="flex h-7 items-center rounded bg-primary px-2.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Save
      </button>
    </div>
  </div>
)

// ---------------------------------------------------------------------------
// ProfilesPanelReact — main export
// ---------------------------------------------------------------------------

export const ProfilesPanelReact = ({
  settings,
  settingsValidationErrors,
  onSelectDefaultPreset,
  onSavePresetDraft,
  onAddPreset,
  onRemovePreset
}: ProfilesPanelReactProps) => {
  const { presets, defaultPresetId } = settings.transformation

  // Which preset's inline edit form is currently open (null = all collapsed).
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)

  // Local form draft — isolated from settings to support Cancel without persisting.
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  // Auto-open edit form when a new preset is added (detected by length increase).
  // addTransformationPreset() auto-sets defaultPresetId to the new preset's id.
  const prevPresetCountRef = useRef(presets.length)
  useEffect(() => {
    if (presets.length > prevPresetCountRef.current) {
      const newPreset = presets.find((p) => p.id === defaultPresetId)
      if (newPreset) {
        setEditingPresetId(newPreset.id)
        setEditDraft(buildDraft(newPreset))
      }
    }
    prevPresetCountRef.current = presets.length
  }, [presets.length, presets, defaultPresetId])

  // Close edit form if the editing preset was removed externally.
  useEffect(() => {
    if (editingPresetId && !presets.some((p) => p.id === editingPresetId)) {
      setEditingPresetId(null)
      setEditDraft(null)
    }
  }, [editingPresetId, presets])

  const openEdit = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    setEditingPresetId(presetId)
    setEditDraft(buildDraft(preset))
  }

  const applyDraftPatch = (patch: Partial<EditDraft>) => {
    if (!editDraft || !editingPresetId) return
    const next = { ...editDraft, ...patch }
    setEditDraft(next)
  }

  const handleSave = async () => {
    if (!editingPresetId || !editDraft) return
    const didSave = await onSavePresetDraft(editingPresetId, editDraft)
    if (didSave) {
      setEditingPresetId(null)
      setEditDraft(null)
    }
  }

  const handleCancel = () => {
    // Discard local draft entirely; parent state is unchanged until Save.
    setEditingPresetId(null)
    setEditDraft(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Scrollable profile card list */}
      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
        role="list"
        aria-label="Transformation profiles"
      >
        {presets.map((preset) => {
          const isEditing = editingPresetId === preset.id
          const isDefault = preset.id === defaultPresetId

          return (
            <div key={preset.id} role="listitem">
              <ProfileCard
                preset={preset}
                isDefault={isDefault}
                isEditing={isEditing}
                onOpenEdit={() => { openEdit(preset.id) }}
                onSetDefault={() => {
                  void onSelectDefaultPreset(preset.id)
                }}
                onRemove={() => {
                  if (isEditing) {
                    setEditingPresetId(null)
                    setEditDraft(null)
                  }
                  void onRemovePreset(preset.id)
                }}
              />

              {/* Inline edit form — rendered directly below the active card */}
              {isEditing && editDraft && (
                <div className="mx-1 rounded-b-md border border-t-0 border-primary/40 bg-primary/5 px-3 pb-3">
                  <ProfileEditForm
                    draft={editDraft}
                    presetId={preset.id}
                    presetNameError={settingsValidationErrors.presetName ?? ''}
                    systemPromptError={settingsValidationErrors.systemPrompt ?? ''}
                    userPromptError={settingsValidationErrors.userPrompt ?? ''}
                    onChangeDraft={applyDraftPatch}
                    onSave={() => { void handleSave() }}
                    onCancel={handleCancel}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add profile — pinned to bottom, dashed ghost style */}
      <div className="border-t p-3">
        <button
          type="button"
          id="profiles-panel-add"
          onClick={() => { void onAddPreset() }}
          className="flex h-7 w-full items-center justify-center gap-1 rounded border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3" />
          Add profile
        </button>
      </div>
    </div>
  )
}
