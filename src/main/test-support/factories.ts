// src/main/test-support/factories.ts
// Reusable factory functions for domain objects used across test files.
// Eliminates copy-paste of settings, job records, and snapshots in every test.

import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { QueueJobRecord } from '../services/job-queue-service'
import type { CaptureResult } from '../services/capture-types'
import {
  createCaptureRequestSnapshot,
  type CaptureRequestSnapshot
} from '../routing/capture-request-snapshot'
import {
  createTransformationRequestSnapshot,
  type TransformationRequestSnapshot
} from '../routing/transformation-request-snapshot'

export const buildSettings = (overrides?: Partial<Settings>): Settings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...overrides
})

export const buildQueueJobRecord = (overrides?: Partial<QueueJobRecord>): QueueJobRecord => ({
  jobId: overrides?.jobId ?? `job-${Date.now()}`,
  audioFilePath: overrides?.audioFilePath ?? '/tmp/test-audio.wav',
  capturedAt: overrides?.capturedAt ?? new Date().toISOString(),
  processingState: overrides?.processingState ?? 'queued',
  terminalStatus: overrides?.terminalStatus ?? null,
  createdAt: overrides?.createdAt ?? new Date().toISOString(),
  updatedAt: overrides?.updatedAt ?? new Date().toISOString()
})

export const buildCaptureResult = (overrides?: Partial<CaptureResult>): CaptureResult => ({
  jobId: overrides?.jobId ?? `capture-${Date.now()}`,
  audioFilePath: overrides?.audioFilePath ?? '/tmp/test-capture.wav',
  capturedAt: overrides?.capturedAt ?? new Date().toISOString()
})

export const buildCaptureRequestSnapshot = (
  overrides?: Partial<CaptureRequestSnapshot>
): Readonly<CaptureRequestSnapshot> =>
  createCaptureRequestSnapshot({
    snapshotId: overrides?.snapshotId ?? `snap-${Date.now()}`,
    capturedAt: overrides?.capturedAt ?? new Date().toISOString(),
    audioFilePath: overrides?.audioFilePath ?? '/tmp/test-audio.wav',
    sttProvider: overrides?.sttProvider ?? 'groq',
    sttModel: overrides?.sttModel ?? 'whisper-large-v3-turbo',
    sttBaseUrlOverride: overrides?.sttBaseUrlOverride ?? null,
    outputLanguage: overrides?.outputLanguage ?? 'auto',
    temperature: overrides?.temperature ?? 0,
    transformationProfile: overrides?.transformationProfile ?? null,
    output: overrides?.output ?? {
      selectedTextSource: 'transformed',
      transcript: { copyToClipboard: true, pasteAtCursor: false },
      transformed: { copyToClipboard: true, pasteAtCursor: false }
    }
  })

export const buildTransformationRequestSnapshot = (
  overrides?: Partial<TransformationRequestSnapshot>
): Readonly<TransformationRequestSnapshot> =>
  createTransformationRequestSnapshot({
    snapshotId: overrides?.snapshotId ?? `tsnap-${Date.now()}`,
    requestedAt: overrides?.requestedAt ?? new Date().toISOString(),
    textSource: overrides?.textSource ?? 'clipboard',
    sourceText: overrides?.sourceText ?? 'test input text',
    profileId: overrides?.profileId ?? 'default',
    provider: overrides?.provider ?? 'google',
    model: overrides?.model ?? 'gemini-2.5-flash',
    baseUrlOverride: overrides?.baseUrlOverride ?? null,
    systemPrompt: overrides?.systemPrompt ?? '',
    userPrompt: overrides?.userPrompt ?? '',
    outputRule: overrides?.outputRule ?? { copyToClipboard: true, pasteAtCursor: false }
  })
