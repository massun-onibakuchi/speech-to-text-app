import type { AudioInputSource } from '../shared/ipc'

interface ResolveRecordingDeviceIdInput {
  preferredDeviceId?: string
  configuredDeviceId?: string
  configuredDetectedAudioSource?: string
  audioInputSources: AudioInputSource[]
}

export const resolveRecordingDeviceId = ({
  preferredDeviceId,
  configuredDeviceId,
  configuredDetectedAudioSource,
  audioInputSources
}: ResolveRecordingDeviceIdInput): string | undefined => {
  const candidate = preferredDeviceId?.trim() || configuredDeviceId?.trim() || 'system_default'
  if (candidate === 'system_default') {
    return undefined
  }

  if (audioInputSources.some((source) => source.id === candidate)) {
    return candidate
  }

  const detectedSourceLabel = configuredDetectedAudioSource?.trim()
  if (detectedSourceLabel && detectedSourceLabel !== 'system_default') {
    const fallbackByDetectedLabel = audioInputSources.find((source) => source.label === detectedSourceLabel)
    if (fallbackByDetectedLabel) {
      return fallbackByDetectedLabel.id
    }
  }

  const fallbackByLegacyLabel = audioInputSources.find((source) => source.label === candidate)
  return fallbackByLegacyLabel?.id
}

export const resolveDetectedAudioSource = (selectedDeviceId: string, audioInputSources: AudioInputSource[]): string => {
  const selected = selectedDeviceId.trim()
  if (selected.length === 0 || selected === 'system_default') {
    return 'system_default'
  }

  const source = audioInputSources.find((item) => item.id === selected)
  return source?.label ?? selected
}

interface RecordingDeviceFallbackWarningInput {
  configuredDeviceId?: string
  resolvedDeviceId?: string
}

export const resolveRecordingDeviceFallbackWarning = ({
  configuredDeviceId,
  resolvedDeviceId
}: RecordingDeviceFallbackWarningInput): string | null => {
  const configured = configuredDeviceId?.trim() ?? ''
  if (!configured || configured === 'system_default') {
    return null
  }
  if (resolvedDeviceId) {
    return null
  }
  return 'Configured microphone is unavailable. Falling back to System Default microphone.'
}
