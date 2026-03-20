/*
 * Where: src/shared/audio-input-sources.test.ts
 * What: Tests for shared audio-input source normalization helpers.
 * Why: Lock the shared main/renderer behavior so device dedupe and system-default
 *      handling stay consistent as the recording flow evolves.
 */

import { describe, expect, it } from 'vitest'
import { dedupeAudioInputSources, SYSTEM_DEFAULT_AUDIO_SOURCE } from './audio-input-sources'

describe('audio-input-sources', () => {
  it('exposes the shared system default microphone source', () => {
    expect(SYSTEM_DEFAULT_AUDIO_SOURCE).toEqual({
      id: 'system_default',
      label: 'System Default Microphone'
    })
  })

  it('dedupes by id, trims values, and drops incomplete sources', () => {
    expect(
      dedupeAudioInputSources([
        { id: ' mic-1 ', label: ' Desk Mic ' },
        { id: 'mic-1', label: 'Ignored duplicate label' },
        { id: '', label: 'Missing id' },
        { id: 'mic-2', label: '   ' },
        { id: 'mic-3', label: 'USB Mic' }
      ])
    ).toEqual([
      { id: 'mic-1', label: 'Desk Mic' },
      { id: 'mic-3', label: 'USB Mic' }
    ])
  })
})
