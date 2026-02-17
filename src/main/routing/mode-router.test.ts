// src/main/routing/mode-router.test.ts
// Contract tests for ModeRouter.
// Verifies routing decisions produce correct mode, lane, and snapshot binding.

import { describe, expect, it } from 'vitest'
import { ModeRouter } from './mode-router'
import { LegacyProcessingModeSource } from './processing-mode-source'
import type { ProcessingModeSource } from './processing-mode-source'
import { createCaptureRequestSnapshot } from './capture-request-snapshot'
import { createTransformationRequestSnapshot } from './transformation-request-snapshot'

const router = new ModeRouter({ modeSource: new LegacyProcessingModeSource() })

describe('ModeRouter', () => {
  it('routes capture to default mode with capture lane', () => {
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: 'snap-1',
      capturedAt: new Date().toISOString(),
      audioFilePath: '/tmp/audio.wav',
      sttProvider: 'groq',
      sttModel: 'whisper-large-v3-turbo',
      outputLanguage: 'auto',
      temperature: 0,
      transformationProfile: null,
      output: {
        transcript: { copyToClipboard: true, pasteAtCursor: false },
        transformed: { copyToClipboard: true, pasteAtCursor: false }
      }
    })

    const ctx = router.routeCapture(snapshot)
    expect(ctx.mode).toBe('default')
    expect(ctx.lane).toBe('capture')
    expect(ctx.snapshot).toBe(snapshot)
  })

  it('routes capture with transformation profile to default mode', () => {
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: 'snap-2',
      capturedAt: new Date().toISOString(),
      audioFilePath: '/tmp/audio.wav',
      sttProvider: 'elevenlabs',
      sttModel: 'scribe_v2',
      outputLanguage: 'en',
      temperature: 0.1,
      transformationProfile: {
        profileId: 'default',
        provider: 'google',
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are a rewriter.',
        userPrompt: 'Rewrite: {{input}}'
      },
      output: {
        transcript: { copyToClipboard: false, pasteAtCursor: true },
        transformed: { copyToClipboard: true, pasteAtCursor: true }
      }
    })

    const ctx = router.routeCapture(snapshot)
    expect(ctx.mode).toBe('default')
    expect(ctx.lane).toBe('capture')
    expect(ctx.snapshot.snapshotId).toBe('snap-2')
  })

  it('routes transformation to transform_only mode with transform lane', () => {
    const snapshot = createTransformationRequestSnapshot({
      snapshotId: 'tsnap-1',
      requestedAt: new Date().toISOString(),
      textSource: 'clipboard',
      sourceText: 'hello world',
      profileId: 'default',
      provider: 'google',
      model: 'gemini-2.5-flash',
      systemPrompt: '',
      userPrompt: '',
      outputRule: { copyToClipboard: true, pasteAtCursor: false }
    })

    const ctx = router.routeTransformation(snapshot)
    expect(ctx.mode).toBe('transform_only')
    expect(ctx.lane).toBe('transform')
    expect(ctx.snapshot).toBe(snapshot)
  })

  it('routes selection-source transformation correctly', () => {
    const snapshot = createTransformationRequestSnapshot({
      snapshotId: 'tsnap-2',
      requestedAt: new Date().toISOString(),
      textSource: 'selection',
      sourceText: 'selected text from app',
      profileId: 'preset-b',
      provider: 'google',
      model: 'gemini-1.5-flash-8b',
      systemPrompt: 'Translate.',
      userPrompt: '{{input}}',
      outputRule: { copyToClipboard: true, pasteAtCursor: true }
    })

    const ctx = router.routeTransformation(snapshot)
    expect(ctx.mode).toBe('transform_only')
    expect(ctx.lane).toBe('transform')
    expect(ctx.snapshot.snapshotId).toBe('tsnap-2')
  })

  it('throws for unsupported processing mode on capture', () => {
    const unsupportedSource: ProcessingModeSource = {
      resolve: () => 'transform_only' as any
    }
    const unsupportedRouter = new ModeRouter({ modeSource: unsupportedSource })
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: 'snap-err',
      capturedAt: new Date().toISOString(),
      audioFilePath: '/tmp/audio.wav',
      sttProvider: 'groq',
      sttModel: 'whisper-large-v3-turbo',
      outputLanguage: 'auto',
      temperature: 0,
      transformationProfile: null,
      output: {
        transcript: { copyToClipboard: true, pasteAtCursor: false },
        transformed: { copyToClipboard: true, pasteAtCursor: false }
      }
    })

    expect(() => unsupportedRouter.routeCapture(snapshot)).toThrow('Unsupported processing mode')
  })
})
