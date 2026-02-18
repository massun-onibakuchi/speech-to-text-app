// Where: src/renderer/settings-validation.test.ts
// What:  Unit tests for Settings form validation helper logic.
// Why:   Lock validation behavior for inline feedback and normalized submit payloads.

import { describe, expect, it } from 'vitest'
import { validateSettingsFormInput } from './settings-validation'

const validInput = {
  transcriptionBaseUrlRaw: '',
  transformationBaseUrlRaw: '',
  presetNameRaw: 'Default',
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
    expect(result.errors.presetName).toBe('Configuration name is required.')
    expect(result.errors.startRecording).toContain('duplicated')
    expect(result.errors.stopRecording).toContain('duplicated')
  })
})
