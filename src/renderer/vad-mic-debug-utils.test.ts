/*
Where: src/renderer/vad-mic-debug-utils.test.ts
What: Tests for the live mic VAD harness summary/log helpers.
Why: Keep the manual-debug harness deterministic where browser APIs are not involved.
*/

import { describe, expect, it } from 'vitest'
import type { GroqBrowserVadDebugEvent } from './groq-browser-vad-capture'
import {
  appendVadDebugEvent,
  describeVadDebugEvent,
  parseVadHarnessConfigDraft,
  summarizeVadUtterance
} from './vad-mic-debug-utils'

describe('vad-mic-debug-utils', () => {
  it('caps the event log to the most recent entries', () => {
    const events: GroqBrowserVadDebugEvent[] = [
      { type: 'speech_start', atMs: 1, utteranceIndex: 0 },
      { type: 'speech_real_start', atMs: 2, utteranceIndex: 0 },
      { type: 'speech_end', atMs: 3, utteranceIndex: 0, audioSamples: 1_600, reason: 'speech_pause' }
    ]

    const actual = events.reduce(
      (list, event) => appendVadDebugEvent(list, event, 2),
      [] as GroqBrowserVadDebugEvent[]
    )

    expect(actual).toEqual([
      events[1],
      events[2]
    ])
  })

  it('builds stable utterance summaries from emitted chunks', () => {
    const summary = summarizeVadUtterance({
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 4,
      wavBytes: new ArrayBuffer(3_200),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtEpochMs: 1_000,
      endedAtEpochMs: 1_240,
      reason: 'session_stop',
      source: 'browser_vad'
    })

    expect(summary).toEqual({
      utteranceIndex: 4,
      reason: 'session_stop',
      startedAtEpochMs: 1_000,
      endedAtEpochMs: 1_240,
      durationMs: 240,
      wavBytes: 3_200
    })
  })

  it('formats debug events for the manual log panel', () => {
    expect(describeVadDebugEvent({
      type: 'frame_processed',
      atMs: 12,
      utteranceIndex: 0,
      frameSamples: 512,
      isSpeech: 0.90234,
      notSpeech: 0.09766
    })).toBe('frame isSpeech=0.902 notSpeech=0.098 samples=512')
  })

  it('formats post-seal summaries for the second-utterance probe', () => {
    expect(describeVadDebugEvent({
      type: 'post_seal_window_summary',
      atMs: 25,
      sourceUtteranceIndex: 0,
      nextUtteranceIndex: 1,
      frameCount: 8,
      maxIsSpeech: 0.22,
      lastIsSpeech: 0.12,
      durationMs: 4000,
      endedBy: 'timeout'
    })).toBe('post-seal source=0 next=1 frames=8 maxIsSpeech=0.22 lastIsSpeech=0.12 endedBy=timeout')
  })

  it('rejects invalid manual config before the harness starts MicVAD', () => {
    expect(parseVadHarnessConfigDraft({
      positiveSpeechThreshold: 'nope',
      negativeSpeechThreshold: '0.25',
      redemptionMs: '900',
      preSpeechPadMs: '400',
      minSpeechMs: '160',
      backpressureSignalMs: '300'
    })).toEqual({
      config: {},
      error: 'MicVAD config fields must be valid numbers.'
    })
  })
})
