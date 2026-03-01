// Where: src/renderer/settings-validation.test.ts
// What:  Unit tests for Settings form validation helper logic.
// Why:   Lock validation behavior for inline feedback and normalized submit payloads.

import { describe, expect, it } from 'vitest'
import { validateSettingsFormInput } from './settings-validation'

const validInput = {
  presetNameRaw: 'Default',
  systemPromptRaw: 'You are a helpful editor.',
  userPromptRaw: 'Rewrite clearly: {{text}}',
  shortcuts: {
    toggleRecording: 'Cmd+Opt+T',
    cancelRecording: 'Cmd+Opt+C',
    runTransform: 'Cmd+Opt+L',
    runTransformOnSelection: 'Cmd+Opt+K',
    pickTransformation: 'Cmd+Opt+P',
    changeTransformationDefault: 'Cmd+Opt+M'
  }
}

describe('validateSettingsFormInput', () => {
  it('normalizes trimmed shortcut values', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      shortcuts: {
        ...validInput.shortcuts,
        runTransform: '  Cmd+Shift+9  '
      }
    })

    expect(result.errors).toEqual({})
    expect(result.normalized.shortcuts.runTransform).toBe('Cmd+Shift+9')
  })

  it('returns inline errors for blank name and duplicate shortcuts', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      presetNameRaw: '  ',
      shortcuts: {
        ...validInput.shortcuts,
        toggleRecording: 'Cmd+Opt+C',
        cancelRecording: 'Cmd+Opt+C'
      }
    })

    expect(result.errors.presetName).toBe('Profile name is required.')
    expect(result.errors.toggleRecording).toContain('duplicated')
    expect(result.errors.cancelRecording).toContain('duplicated')
  })

  it('detects duplicates regardless of case and modifier alias/order', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      shortcuts: {
        ...validInput.shortcuts,
        runTransform: 'cmd+opt+k',
        runTransformOnSelection: 'Option+Command+K'
      }
    })

    expect(result.errors.runTransform).toContain('duplicated')
    expect(result.errors.runTransformOnSelection).toContain('duplicated')
  })

  it('requires at least one modifier key in each shortcut', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      shortcuts: {
        ...validInput.shortcuts,
        runTransform: 'L'
      }
    })

    expect(result.errors.runTransform).toContain('must include at least one modifier key')
  })

  it('rejects modifier-only shortcut values', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      shortcuts: {
        ...validInput.shortcuts,
        runTransform: 'Shift'
      }
    })

    expect(result.errors.runTransform).toContain('must include at least one modifier key')
  })

  it('requires non-blank prompts and {{text}} in the user prompt', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      systemPromptRaw: '   ',
      userPromptRaw: 'Rewrite this without placeholder'
    })

    expect(result.errors.systemPrompt).toBe('System prompt is required.')
    expect(result.errors.userPrompt).toContain('{{text}}')
  })

  it('normalizes legacy {{input}} user prompt placeholder to {{text}} on save payloads', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      userPromptRaw: 'Rewrite: {{input}}'
    })

    expect(result.errors.userPrompt).toBeUndefined()
    expect(result.normalized.userPrompt).toBe('Rewrite: {{text}}')
  })
})
