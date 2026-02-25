// Where: src/renderer/settings-validation.test.ts
// What:  Unit tests for Settings form validation helper logic.
// Why:   Lock validation behavior for inline feedback and normalized submit payloads.

import { describe, expect, it } from 'vitest'
import { validateSettingsFormInput } from './settings-validation'

const validInput = {
  transcriptionBaseUrlRaw: '',
  transformationBaseUrlRaw: '',
  presetNameRaw: 'Default',
  systemPromptRaw: 'You are a helpful editor.',
  userPromptRaw: 'Rewrite clearly: {{text}}',
  shortcuts: {
    startRecording: 'Cmd+Opt+R',
    stopRecording: 'Cmd+Opt+S',
    toggleRecording: 'Cmd+Opt+T',
    cancelRecording: 'Cmd+Opt+C',
    runTransform: 'Cmd+Opt+L',
    runTransformOnSelection: 'Cmd+Opt+K',
    pickTransformation: 'Cmd+Opt+P',
    changeTransformationDefault: 'Cmd+Opt+M'
  }
}

describe('validateSettingsFormInput', () => {
  it('normalizes optional URLs and trimmed shortcut values', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      transcriptionBaseUrlRaw: '  https://stt-proxy.local/base  ',
      transformationBaseUrlRaw: 'https://llm-proxy.local',
      shortcuts: {
        ...validInput.shortcuts,
        runTransform: '  Cmd+Shift+9  '
      }
    })

    expect(result.errors).toEqual({})
    expect(result.normalized.transcriptionBaseUrlOverride).toBe('https://stt-proxy.local/base')
    expect(result.normalized.transformationBaseUrlOverride).toBe('https://llm-proxy.local')
    expect(result.normalized.shortcuts.runTransform).toBe('Cmd+Shift+9')
  })

  it('returns inline errors for invalid URL, blank name, and duplicate shortcuts', () => {
    const result = validateSettingsFormInput({
      ...validInput,
      transcriptionBaseUrlRaw: 'not a url',
      presetNameRaw: '  ',
      shortcuts: {
        ...validInput.shortcuts,
        startRecording: 'Cmd+Opt+R',
        stopRecording: 'Cmd+Opt+R'
      }
    })

    expect(result.errors.transcriptionBaseUrl).toContain('must be a valid URL')
    expect(result.errors.presetName).toBe('Profile name is required.')
    expect(result.errors.startRecording).toContain('duplicated')
    expect(result.errors.stopRecording).toContain('duplicated')
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

  it('rejects invalid LLM override URL and normalizes blank override to null', () => {
    const invalid = validateSettingsFormInput({
      ...validInput,
      transformationBaseUrlRaw: 'ftp://llm-proxy.local'
    })
    expect(invalid.errors.transformationBaseUrl).toContain('must use http:// or https://')

    const blank = validateSettingsFormInput({
      ...validInput,
      transformationBaseUrlRaw: '   \n\t  '
    })
    expect(blank.errors.transformationBaseUrl).toBeUndefined()
    expect(blank.normalized.transformationBaseUrlOverride).toBeNull()
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
