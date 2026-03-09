/*
Where: src/renderer/streaming-speech-chunker.test.ts
What: Focused tests for pause-bounded chunk detection in streaming mode.
Why: Lock the intended chunk boundary semantics before browser audio capture
     wiring adds more moving parts around the same policy.
*/

import { describe, expect, it } from 'vitest'
import { DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS, StreamingSpeechChunker } from './streaming-speech-chunker'

const makeFrame = (amplitude: number, timestampMs: number, sampleCount = 1600) => ({
  samples: new Float32Array(sampleCount).fill(amplitude),
  timestampMs
})

const sampleCountForMs = (durationMs: number, sampleRateHz = 16000): number => (durationMs / 1000) * sampleRateHz

describe('StreamingSpeechChunker', () => {
  it('does not flush during leading silence', () => {
    const chunker = new StreamingSpeechChunker()

    expect(chunker.observeFrame(makeFrame(0, 0), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 100), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
  })

  it('flushes after speech followed by trailing silence', () => {
    const chunker = new StreamingSpeechChunker()

    expect(chunker.observeFrame(makeFrame(0.2, 0), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0.2, 100), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 300), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 700), 16000)).toEqual({ shouldFlush: true, shouldDiscardPending: false, reason: 'speech_pause' })
  })

  it('resets after below-threshold speech followed by long silence so a later utterance starts fresh', () => {
    const chunker = new StreamingSpeechChunker()

    expect(chunker.observeFrame(makeFrame(0.2, 0), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 700), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: true, reason: null })

    expect(chunker.observeFrame(makeFrame(0.2, 1200), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0.2, 1300), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 1900), 16000)).toEqual({ shouldFlush: true, shouldDiscardPending: false, reason: 'speech_pause' })
  })

  it('does not flush just-below-threshold speech after trailing silence', () => {
    const chunker = new StreamingSpeechChunker()
    const justBelowMinSpeechMs = DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.minSpeechMs - 10

    expect(chunker.observeFrame(makeFrame(0.2, 0, sampleCountForMs(justBelowMinSpeechMs)), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 700), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: true, reason: null })
  })

  it('still flushes speech at or above the minimum duration threshold', () => {
    const chunker = new StreamingSpeechChunker()
    const atMinSpeechMs = DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.minSpeechMs

    expect(chunker.observeFrame(makeFrame(0.2, 0, sampleCountForMs(atMinSpeechMs)), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 700), 16000)).toEqual({ shouldFlush: true, shouldDiscardPending: false, reason: 'speech_pause' })
  })

  it('resets without flushing when a short blip reaches the max chunk limit mostly through silence', () => {
    const chunker = new StreamingSpeechChunker({
      maxChunkMs: 500
    })

    expect(chunker.observeFrame(makeFrame(0.2, 0), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0, 420), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: true, reason: null })

    expect(chunker.observeFrame(makeFrame(0.2, 800), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
  })

  it('flushes long uninterrupted speech at the max chunk limit', () => {
    const chunker = new StreamingSpeechChunker({
      maxChunkMs: 500
    })

    expect(chunker.observeFrame(makeFrame(0.25, 0), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0.25, 200), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
    expect(chunker.observeFrame(makeFrame(0.25, 420), 16000)).toEqual({ shouldFlush: true, shouldDiscardPending: false, reason: 'max_chunk' })
  })

  it('resets after a flush so the next utterance can form a new chunk', () => {
    const chunker = new StreamingSpeechChunker()

    chunker.observeFrame(makeFrame(0.2, 0), 16000)
    chunker.observeFrame(makeFrame(0.2, 100), 16000)
    expect(chunker.observeFrame(makeFrame(0, 700), 16000)).toEqual({ shouldFlush: true, shouldDiscardPending: false, reason: 'speech_pause' })

    expect(chunker.observeFrame(makeFrame(0.2, 1200), 16000)).toEqual({ shouldFlush: false, shouldDiscardPending: false, reason: null })
  })
})
