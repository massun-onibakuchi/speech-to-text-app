// Where: src/renderer/blocked-control.test.ts
// What: Unit tests for Home blocked-control messaging helpers.
// Why: Ensure disabled/blocked action guidance remains explicit and consistent.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import {
  isTransformedOutputRecordingBlocked,
  resolveRecordingBlockedMessage,
  resolveTransformBlockedMessage
} from './blocked-control'

describe('resolveRecordingBlockedMessage', () => {
  it.each([
    { provider: 'groq' as const, status: { groq: false, elevenlabs: true, google: true } },
    { provider: 'elevenlabs' as const, status: { groq: true, elevenlabs: false, google: true } }
  ])('blocks when selected STT provider key is missing ($provider)', ({ provider, status }) => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = provider
    settings.output.selectedTextSource = 'transcript'

    const result = resolveRecordingBlockedMessage(settings, status)
    expect(result).toEqual({
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > Speech-to-Text and save a key or switch provider.',
      deepLinkTarget: 'settings'
    })
  })

  it('returns null when STT key is present and transcript output is selected', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.output.selectedTextSource = 'transcript'
    const result = resolveRecordingBlockedMessage(settings, {
      groq: true,
      elevenlabs: false,
      google: false
    })
    expect(result).toBeNull()
  })

  it('returns null for elevenlabs when elevenlabs key is present and transcript output is selected', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = 'elevenlabs'
    settings.output.selectedTextSource = 'transcript'
    const result = resolveRecordingBlockedMessage(settings, {
      groq: false,
      elevenlabs: true,
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
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > Speech-to-Text and save a key or switch provider.',
      deepLinkTarget: 'settings'
    })
  })

  it('returns transformed-output guidance when transformed output is selected and Google key is missing', () => {
    const result = resolveRecordingBlockedMessage(DEFAULT_SETTINGS, {
      groq: true,
      elevenlabs: true,
      google: false
    })
    expect(result).toEqual({
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > LLM and save a Google key, or switch output mode to Transcript.',
      deepLinkTarget: 'settings'
    })
  })

  it('prioritizes STT guidance when both STT and Google keys are missing', () => {
    const result = resolveRecordingBlockedMessage(DEFAULT_SETTINGS, {
      groq: false,
      elevenlabs: true,
      google: false
    })
    expect(result).toEqual({
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > Speech-to-Text and save a key or switch provider.',
      deepLinkTarget: 'settings'
    })
  })
})

describe('isTransformedOutputRecordingBlocked', () => {
  it('returns true only when transformed output is selected and Google key is missing', () => {
    expect(
      isTransformedOutputRecordingBlocked(DEFAULT_SETTINGS, {
        groq: true,
        elevenlabs: true,
        google: false
      })
    ).toBe(true)

    expect(
      isTransformedOutputRecordingBlocked(DEFAULT_SETTINGS, {
        groq: true,
        elevenlabs: true,
        google: true
      })
    ).toBe(false)

    const transcriptSettings = structuredClone(DEFAULT_SETTINGS)
    transcriptSettings.output.selectedTextSource = 'transcript'
    expect(
      isTransformedOutputRecordingBlocked(transcriptSettings, {
        groq: true,
        elevenlabs: true,
        google: false
      })
    ).toBe(false)
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
      nextStep: 'Open Settings > LLM and save a Google key.',
      deepLinkTarget: 'settings'
    })
  })
})
