// Where: src/renderer/blocked-control.test.ts
// What: Unit tests for Home blocked-control messaging helpers.
// Why: Ensure disabled/blocked action guidance remains explicit and consistent.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { LOCAL_STT_MODEL, LOCAL_STT_PROVIDER } from '../shared/local-stt'
import { LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_NEXT_STEP } from '../shared/local-streaming-messages'
import {
  LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_MESSAGE,
  isLocalTransformedOutputRecordingBlocked,
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

  it('blocks recording only for the local transformed lane that is not implemented yet', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = LOCAL_STT_PROVIDER
    settings.transcription.model = LOCAL_STT_MODEL
    settings.output.selectedTextSource = 'transformed'

    const result = resolveRecordingBlockedMessage(settings, {
      groq: false,
      elevenlabs: false,
      google: true
    })
    expect(result).toEqual({
      reason: 'Recording is blocked.',
      nextStep: LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_NEXT_STEP,
      deepLinkTarget: 'settings'
    })
  })

  it('does not block local transcript recording once the raw local lane is enabled', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = LOCAL_STT_PROVIDER
    settings.transcription.model = LOCAL_STT_MODEL
    settings.output.selectedTextSource = 'transcript'

    expect(resolveRecordingBlockedMessage(settings, {
      groq: false,
      elevenlabs: false,
      google: false
    })).toBeNull()
  })

  it('returns transformed-output guidance when transformed output is selected and Google key is missing', () => {
    const result = resolveRecordingBlockedMessage(DEFAULT_SETTINGS, {
      groq: true,
      elevenlabs: true,
      google: false
    })
    expect(result).toEqual({
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > LLM Transformation and save a Google key, or switch output mode to Transcript.',
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

describe('isLocalTransformedOutputRecordingBlocked', () => {
  it('returns true only for the local provider with transformed output selected', () => {
    const localTransformed = structuredClone(DEFAULT_SETTINGS)
    localTransformed.transcription.provider = LOCAL_STT_PROVIDER
    localTransformed.transcription.model = LOCAL_STT_MODEL
    localTransformed.output.selectedTextSource = 'transformed'

    const localTranscript = structuredClone(localTransformed)
    localTranscript.output.selectedTextSource = 'transcript'

    expect(isLocalTransformedOutputRecordingBlocked(localTransformed)).toBe(true)
    expect(isLocalTransformedOutputRecordingBlocked(localTranscript)).toBe(false)
    expect(LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_MESSAGE).toContain('Transcript')
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
