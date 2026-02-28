// Where: src/renderer/settings-validation.ts
// What:  Validation helpers for Settings form fields in renderer UI.
// Why:   Keep form validation logic small, testable, and independent from DOM wiring.

import { canonicalizeShortcutForDuplicateCheck, hasModifierShortcut } from './shortcut-capture'

export type SettingsValidationField =
  | 'transcriptionBaseUrl'
  | 'transformationBaseUrl'
  | 'presetName'
  | 'systemPrompt'
  | 'userPrompt'
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

export type SettingsValidationErrors = Partial<Record<SettingsValidationField, string>>

export interface SettingsValidationInput {
  transcriptionBaseUrlRaw: string
  transformationBaseUrlRaw: string
  presetNameRaw: string
  systemPromptRaw: string
  userPromptRaw: string
  shortcuts: Record<
    | 'toggleRecording'
    | 'cancelRecording'
    | 'runTransform'
    | 'runTransformOnSelection'
    | 'pickTransformation'
    | 'changeTransformationDefault',
    string
  >
}

export interface SettingsValidationResult {
  errors: SettingsValidationErrors
  normalized: {
    transcriptionBaseUrlOverride: string | null
    transformationBaseUrlOverride: string | null
    presetName: string
    systemPrompt: string
    userPrompt: string
    shortcuts: SettingsValidationInput['shortcuts']
  }
}

export interface TransformationPresetValidationInput {
  presetNameRaw: string
  systemPromptRaw: string
  userPromptRaw: string
}

export interface TransformationPresetValidationResult {
  errors: Pick<SettingsValidationErrors, 'presetName' | 'systemPrompt' | 'userPrompt'>
  normalized: {
    presetName: string
    systemPrompt: string
    userPrompt: string
  }
}

const USER_PROMPT_PLACEHOLDER = '{{text}}'
const LEGACY_USER_PROMPT_PLACEHOLDER = '{{input}}'

export const validateTransformationPresetDraft = (
  input: TransformationPresetValidationInput
): TransformationPresetValidationResult => {
  const errors: TransformationPresetValidationResult['errors'] = {}

  const presetName = input.presetNameRaw.trim()
  if (presetName.length === 0) {
    errors.presetName = 'Profile name is required.'
  }

  const systemPrompt = input.systemPromptRaw
  if (systemPrompt.trim().length === 0) {
    errors.systemPrompt = 'System prompt is required.'
  }

  const userPrompt = input.userPromptRaw.replaceAll(LEGACY_USER_PROMPT_PLACEHOLDER, USER_PROMPT_PLACEHOLDER)
  if (userPrompt.trim().length === 0) {
    errors.userPrompt = 'User prompt is required and must include {{text}}.'
  } else if (!userPrompt.includes(USER_PROMPT_PLACEHOLDER)) {
    errors.userPrompt = 'User prompt must include {{text}} where the transcript should be inserted.'
  }

  return {
    errors,
    normalized: {
      presetName,
      systemPrompt,
      userPrompt
    }
  }
}

const normalizeOptionalUrl = (raw: string): string | null => {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

const validateOptionalUrl = (fieldLabel: string, raw: string): string | null => {
  const normalized = normalizeOptionalUrl(raw)
  if (normalized === null) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return `${fieldLabel} must be a valid URL.`
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `${fieldLabel} must use http:// or https://.`
  }
  return null
}

const shortcutLabels: Array<{ key: keyof SettingsValidationInput['shortcuts']; label: string }> = [
  { key: 'toggleRecording', label: 'Toggle recording shortcut' },
  { key: 'cancelRecording', label: 'Cancel recording shortcut' },
  { key: 'runTransform', label: 'Run transform shortcut' },
  { key: 'runTransformOnSelection', label: 'Run transform on selection shortcut' },
  { key: 'pickTransformation', label: 'Pick transformation shortcut' },
  { key: 'changeTransformationDefault', label: 'Change default transformation shortcut' }
]

export const validateSettingsFormInput = (input: SettingsValidationInput): SettingsValidationResult => {
  const errors: SettingsValidationErrors = {}

  const normalizedShortcuts = {
    toggleRecording: input.shortcuts.toggleRecording.trim(),
    cancelRecording: input.shortcuts.cancelRecording.trim(),
    runTransform: input.shortcuts.runTransform.trim(),
    runTransformOnSelection: input.shortcuts.runTransformOnSelection.trim(),
    pickTransformation: input.shortcuts.pickTransformation.trim(),
    changeTransformationDefault: input.shortcuts.changeTransformationDefault.trim()
  }

  for (const shortcut of shortcutLabels) {
    if (normalizedShortcuts[shortcut.key].length === 0) {
      errors[shortcut.key] = `${shortcut.label} is required.`
      continue
    }
    if (!hasModifierShortcut(normalizedShortcuts[shortcut.key])) {
      errors[shortcut.key] = `${shortcut.label} must include at least one modifier key.`
    }
  }

  const reverseIndex = new Map<string, Array<keyof SettingsValidationInput['shortcuts']>>()
  for (const shortcut of shortcutLabels) {
    const value = normalizedShortcuts[shortcut.key]
    if (value.length === 0) {
      continue
    }
    const canonicalValue = canonicalizeShortcutForDuplicateCheck(value)
    const matches = reverseIndex.get(canonicalValue) ?? []
    matches.push(shortcut.key)
    reverseIndex.set(canonicalValue, matches)
  }
  for (const [value, keys] of reverseIndex.entries()) {
    if (keys.length < 2) {
      continue
    }
    for (const key of keys) {
      errors[key] = `Shortcut "${value}" is duplicated.`
    }
  }

  const presetValidation = validateTransformationPresetDraft({
    presetNameRaw: input.presetNameRaw,
    systemPromptRaw: input.systemPromptRaw,
    userPromptRaw: input.userPromptRaw
  })
  Object.assign(errors, presetValidation.errors)

  const transcriptionBaseUrlError = validateOptionalUrl('STT base URL override', input.transcriptionBaseUrlRaw)
  if (transcriptionBaseUrlError) {
    errors.transcriptionBaseUrl = transcriptionBaseUrlError
  }
  const transformationBaseUrlError = validateOptionalUrl('LLM base URL override', input.transformationBaseUrlRaw)
  if (transformationBaseUrlError) {
    errors.transformationBaseUrl = transformationBaseUrlError
  }

  return {
    errors,
    normalized: {
      transcriptionBaseUrlOverride: normalizeOptionalUrl(input.transcriptionBaseUrlRaw),
      transformationBaseUrlOverride: normalizeOptionalUrl(input.transformationBaseUrlRaw),
      presetName: presetValidation.normalized.presetName,
      systemPrompt: presetValidation.normalized.systemPrompt,
      userPrompt: presetValidation.normalized.userPrompt,
      shortcuts: normalizedShortcuts
    }
  }
}
