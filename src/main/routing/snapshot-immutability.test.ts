// src/main/routing/snapshot-immutability.test.ts
// Verifies that request snapshots are deeply frozen after creation.
// This is a contract test for Phase 3B concurrent isolation guarantee:
// once a snapshot is created, no property (including nested) can be mutated.

import { describe, expect, it } from 'vitest'
import { createCaptureRequestSnapshot } from './capture-request-snapshot'
import { createTransformationRequestSnapshot } from './transformation-request-snapshot'

const makeCaptureSnapshot = () =>
  createCaptureRequestSnapshot({
    snapshotId: 'snap-1',
    capturedAt: new Date().toISOString(),
    audioFilePath: '/tmp/audio.wav',
    sttProvider: 'groq',
    sttModel: 'whisper-large-v3-turbo',
    sttBaseUrlOverride: null,
    outputLanguage: 'auto',
    temperature: 0,
    transformationProfile: {
      profileId: 'default',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: 'sys',
      userPrompt: 'usr'
    },
    output: {
      selectedTextSource: 'transcript',
      transcript: { copyToClipboard: true, pasteAtCursor: false },
      transformed: { copyToClipboard: true, pasteAtCursor: false }
    }
  })

const makeTransformSnapshot = () =>
  createTransformationRequestSnapshot({
    snapshotId: 'tsnap-1',
    requestedAt: new Date().toISOString(),
    textSource: 'clipboard',
    sourceText: 'hello',
    profileId: 'default',
    provider: 'google',
    model: 'gemini-2.5-flash',
    baseUrlOverride: null,
    systemPrompt: '',
    userPrompt: '',
    outputRule: { copyToClipboard: true, pasteAtCursor: false }
  })

describe('Snapshot immutability', () => {
  it('CaptureRequestSnapshot is frozen at top level', () => {
    const snapshot = makeCaptureSnapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('CaptureRequestSnapshot rejects top-level property mutation', () => {
    const snapshot = makeCaptureSnapshot()
    expect(() => {
      ;(snapshot as any).sttProvider = 'elevenlabs'
    }).toThrow()
  })

  it('CaptureRequestSnapshot rejects nested output property mutation', () => {
    const snapshot = makeCaptureSnapshot()
    expect(() => {
      ;(snapshot.output.transcript as any).copyToClipboard = false
    }).toThrow()
  })

  it('CaptureRequestSnapshot rejects nested transformationProfile mutation', () => {
    const snapshot = makeCaptureSnapshot()
    expect(() => {
      ;(snapshot.transformationProfile as any).systemPrompt = 'changed'
    }).toThrow()
  })

  it('TransformationRequestSnapshot is frozen at top level', () => {
    const snapshot = makeTransformSnapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('TransformationRequestSnapshot rejects top-level property mutation', () => {
    const snapshot = makeTransformSnapshot()
    expect(() => {
      ;(snapshot as any).sourceText = 'changed'
    }).toThrow()
  })

  it('TransformationRequestSnapshot rejects nested outputRule mutation', () => {
    const snapshot = makeTransformSnapshot()
    expect(() => {
      ;(snapshot.outputRule as any).copyToClipboard = false
    }).toThrow()
  })
})
