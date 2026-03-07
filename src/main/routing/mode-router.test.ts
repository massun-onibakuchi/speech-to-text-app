// src/main/routing/mode-router.test.ts
// Contract tests for ModeRouter.
// Verifies routing decisions produce correct mode, lane, and snapshot binding.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { ModeRouter } from './mode-router'
import { DefaultProcessingModeSource, SettingsBackedProcessingModeSource } from './processing-mode-source'
import type { ProcessingModeSource } from './processing-mode-source'
import { createCaptureRequestSnapshot } from './capture-request-snapshot'
import { createTransformationRequestSnapshot } from './transformation-request-snapshot'

const router = new ModeRouter({ modeSource: new DefaultProcessingModeSource() })

describe('ModeRouter', () => {
  it('routes capture to default mode with capture lane', () => {
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: 'snap-1',
      capturedAt: new Date().toISOString(),
      audioFilePath: '/tmp/audio.wav',
      sttProvider: 'groq',
      sttModel: 'whisper-large-v3-turbo',
      sttBaseUrlOverride: null,
      outputLanguage: 'auto',
      temperature: 0,
      sttHints: { contextText: '', dictionaryTerms: [] },
      correctionDictionaryEntries: [],
      transformationProfile: null,
      output: {
        selectedTextSource: 'transcript',
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
      sttBaseUrlOverride: null,
      outputLanguage: 'en',
      temperature: 0.1,
      sttHints: { contextText: 'finance terms', dictionaryTerms: ['ARR', 'MRR'] },
      correctionDictionaryEntries: [
        { key: 'Codex', value: 'Codex' }
      ],
      transformationProfile: {
        profileId: 'default',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: 'You are a rewriter.',
        userPrompt: 'Rewrite:\n<input_text>{{text}}</input_text>'
      },
      output: {
        selectedTextSource: 'transformed',
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
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
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
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: 'Translate.',
      userPrompt: '<input_text>{{text}}</input_text>',
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
      sttBaseUrlOverride: null,
      outputLanguage: 'auto',
      temperature: 0,
      sttHints: { contextText: '', dictionaryTerms: [] },
      correctionDictionaryEntries: [],
      transformationProfile: null,
      output: {
        selectedTextSource: 'transcript',
        transcript: { copyToClipboard: true, pasteAtCursor: false },
        transformed: { copyToClipboard: true, pasteAtCursor: false }
      }
    })

    expect(() => unsupportedRouter.routeCapture(snapshot)).toThrow('Unsupported processing mode')
  })

  it('exposes the settings-backed streaming mode without changing transform-only routing', () => {
    const router = new ModeRouter({
      modeSource: new SettingsBackedProcessingModeSource({
        getSettings: () => ({
          processing: {
            ...DEFAULT_SETTINGS.processing,
            mode: 'streaming'
          }
        })
      })
    })

    expect(router.resolveProcessingMode()).toBe('streaming')

    const snapshot = createTransformationRequestSnapshot({
      snapshotId: 'tsnap-streaming',
      requestedAt: new Date().toISOString(),
      textSource: 'clipboard',
      sourceText: 'hello world',
      profileId: 'default',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
      outputRule: { copyToClipboard: true, pasteAtCursor: false }
    })

    const ctx = router.routeTransformation(snapshot)
    expect(ctx.mode).toBe('transform_only')
    expect(ctx.lane).toBe('transform')
  })
})
