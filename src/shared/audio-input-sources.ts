/*
 * Where: src/shared/audio-input-sources.ts
 * What: Shared audio-input source constants and normalization helpers.
 * Why: Keep main-process discovery and renderer-side source merging aligned so
 *      device labels, dedupe, and the system-default option cannot drift apart.
 */

import type { AudioInputSource } from './ipc'

export const SYSTEM_DEFAULT_AUDIO_SOURCE: AudioInputSource = {
  id: 'system_default',
  label: 'System Default Microphone'
}

export const dedupeAudioInputSources = (sources: AudioInputSource[]): AudioInputSource[] => {
  const unique = new Map<string, AudioInputSource>()

  for (const source of sources) {
    const id = source.id.trim()
    const label = source.label.trim()
    if (id.length === 0 || label.length === 0) {
      continue
    }

    if (!unique.has(id)) {
      unique.set(id, { id, label })
    }
  }

  return [...unique.values()]
}
