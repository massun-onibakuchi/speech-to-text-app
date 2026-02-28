// Where: src/renderer/blocked-control.test.ts
// What: Unit tests for Home blocked-control messaging helpers.
// Why: Ensure disabled/blocked action guidance remains explicit and consistent.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { resolveRecordingBlockedMessage, resolveTransformBlockedMessage } from './blocked-control'

describe('resolveRecordingBlockedMessage', () => {
  it('returns null when the configured STT provider has a saved key', () => {
    const result = resolveRecordingBlockedMessage(DEFAULT_SETTINGS, {
      groq: true,
      elevenlabs: false,
      google: false
    })
    expect(result).toBeNull()
  })

  it('returns actionable Groq guidance when Groq key is missing', () => {
    const result = resolveRecordingBlockedMessage(DEFAULT_SETTINGS, {
      groq: false,
      elevenlabs: false,
      google: false
    })
    expect(result).toEqual({
      reason: 'Recording is blocked because the Groq API key is missing.',
      nextStep: 'Open Settings > Speech-to-Text and save a Groq key.',
      deepLinkTarget: 'settings'
    })
  })
})

describe('resolveTransformBlockedMessage', () => {
  it('returns null when Google key is present', () => {
    const result = resolveTransformBlockedMessage(DEFAULT_SETTINGS, {
      groq: true,
      elevenlabs: true,
      google: true
    })
    expect(result).toBeNull()
  })

  it('returns missing-key guidance when google key is not present', () => {
    const result = resolveTransformBlockedMessage(DEFAULT_SETTINGS, {
      groq: true,
      elevenlabs: true,
      google: false
    })
    expect(result).toEqual({
      reason: 'Transformation is blocked because the Google API key is missing.',
      nextStep: 'Open Settings > LLM Transformation and save a Google key.',
      deepLinkTarget: 'settings'
    })
  })
})
