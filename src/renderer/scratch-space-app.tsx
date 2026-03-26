/*
Where: src/renderer/scratch-space-app.tsx
What: Floating scratch-space popup renderer for drafting, dictating, transforming, and pasting.
Why: Keep the new popup isolated from the main settings shell while reusing the same
     preload API, theme tokens, and transformation-profile settings.
*/

import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Mic, Square, WandSparkles } from 'lucide-react'
import { type Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot } from '../shared/ipc'

const SCRATCH_DRAFT_SAVE_DEBOUNCE_MS = 180

let appRoot: Root | null = null

const pickRecordingMimeType = (): string | undefined => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return undefined
}

const joinDraftText = (currentDraft: string, nextText: string): string => {
  const normalizedNext = nextText.trim()
  if (normalizedNext.length === 0) {
    return currentDraft
  }
  const normalizedCurrent = currentDraft.trimEnd()
  if (normalizedCurrent.length === 0) {
    return normalizedNext
  }
  return `${normalizedCurrent}\n${normalizedNext}`
}

const ScratchSpaceApp = () => {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatusSnapshot>({
    groq: false,
    elevenlabs: false,
    google: false
  })
  const [draft, setDraft] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState('Type or dictate, then press Cmd+Enter.')
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef('')

  const focusTextarea = (): void => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }

  const persistDraftNow = async (nextDraft: string): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await window.speechToTextApi.setScratchSpaceDraft(nextDraft)
  }

  const scheduleDraftSave = (nextDraft: string): void => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void window.speechToTextApi.setScratchSpaceDraft(nextDraft)
    }, SCRATCH_DRAFT_SAVE_DEBOUNCE_MS)
  }

  const applyDraft = (nextDraft: string, options?: { persist?: boolean }): void => {
    draftRef.current = nextDraft
    setDraft(nextDraft)
    if (options?.persist !== false) {
      scheduleDraftSave(nextDraft)
    }
  }

  const resetSelectionToDefault = (nextSettings: Settings): void => {
    const defaultPresetId = nextSettings.transformation.defaultPresetId
    const fallbackPresetId = nextSettings.transformation.presets[0]?.id ?? ''
    setSelectedPresetId(
      nextSettings.transformation.presets.some((preset) => preset.id === defaultPresetId)
        ? defaultPresetId
        : fallbackPresetId
    )
  }

  const refreshBootstrap = async (options?: { keepDraft?: boolean }): Promise<void> => {
    const [nextSettings, nextApiKeyStatus, nextDraft] = await Promise.all([
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getApiKeyStatus(),
      window.speechToTextApi.getScratchSpaceDraft()
    ])
    setSettings(nextSettings)
    setApiKeyStatus(nextApiKeyStatus)
    resetSelectionToDefault(nextSettings)
    if (!options?.keepDraft) {
      draftRef.current = nextDraft
      setDraft(nextDraft)
    }
    focusTextarea()
  }

  const cleanupRecordingResources = (): void => {
    mediaRecorderRef.current = null
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop()
      }
    }
    mediaStreamRef.current = null
    chunksRef.current = []
    startedAtRef.current = ''
    setIsRecording(false)
  }

  const startRecording = async (): Promise<void> => {
    if (!settings) {
      return
    }

    const provider = settings.transcription.provider
    if (!apiKeyStatus[provider]) {
      const providerLabel = provider === 'groq' ? 'Groq' : 'ElevenLabs'
      setError(`Missing ${providerLabel} API key. Add it in Settings before dictating into scratch space.`)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This environment does not support microphone recording.')
      return
    }

    const selectedDeviceId = settings.recording.device.trim()
    const constraints: MediaStreamConstraints = {
      audio: {
        ...(selectedDeviceId.length > 0 && selectedDeviceId !== 'system_default'
          ? { deviceId: { exact: selectedDeviceId } }
          : {}),
        sampleRate: { ideal: settings.recording.sampleRateHz },
        channelCount: { ideal: settings.recording.channels }
      }
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      const preferredMimeType = pickRecordingMimeType()
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(mediaStream, { mimeType: preferredMimeType })
        : new MediaRecorder(mediaStream)

      chunksRef.current = []
      mediaStreamRef.current = mediaStream
      mediaRecorderRef.current = mediaRecorder
      startedAtRef.current = new Date().toISOString()
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      })
      mediaRecorder.start()
      setError('')
      setNotice('Listening… press the button again to insert the transcript.')
      setIsRecording(true)
      await window.speechToTextApi.playSound('recording_started')
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : 'Unable to start recording.')
      cleanupRecordingResources()
    }
  }

  const stopRecording = async (): Promise<void> => {
    const mediaRecorder = mediaRecorderRef.current
    if (!mediaRecorder) {
      return
    }

    setIsBusy(true)
    setError('')
    setNotice('Transcribing speech into the draft…')

    try {
      const result = await new Promise<Blob>((resolve, reject) => {
        mediaRecorder.addEventListener(
          'stop',
          async () => {
            try {
              const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' })
              resolve(blob)
            } catch (blobError) {
              reject(blobError)
            }
          },
          { once: true }
        )
        mediaRecorder.addEventListener(
          'error',
          () => {
            reject(new Error('Scratch-space recording failed to stop cleanly.'))
          },
          { once: true }
        )
        mediaRecorder.stop()
      })
      await window.speechToTextApi.playSound('recording_stopped')
      const transcription = await window.speechToTextApi.transcribeScratchSpaceAudio({
        data: new Uint8Array(await result.arrayBuffer()),
        mimeType: result.type || 'audio/webm',
        capturedAt: startedAtRef.current || new Date().toISOString()
      })
      cleanupRecordingResources()

      if (transcription.status === 'error' || !transcription.text) {
        setError(transcription.message)
        setNotice('Dictation did not update the draft.')
        return
      }

      const nextDraft = joinDraftText(draftRef.current, transcription.text)
      applyDraft(nextDraft)
      setNotice('Speech inserted into the draft.')
      focusTextarea()
    } catch (transcriptionError) {
      cleanupRecordingResources()
      setError(transcriptionError instanceof Error ? transcriptionError.message : 'Transcription failed.')
      setNotice('Dictation did not update the draft.')
    } finally {
      setIsBusy(false)
    }
  }

  const cancelRecording = async (): Promise<void> => {
    const mediaRecorder = mediaRecorderRef.current
    if (!mediaRecorder) {
      return
    }

    chunksRef.current = []
    cleanupRecordingResources()
    try {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
      await window.speechToTextApi.playSound('recording_cancelled')
    } catch {
      // Closing the popup should not fail because MediaRecorder cancellation reported late.
    }
  }

  const runTransformation = async (): Promise<void> => {
    if (!settings || isBusy || isRecording) {
      return
    }

    setIsBusy(true)
    setError('')
    setNotice('Transforming and pasting back to the target app…')

    try {
      await persistDraftNow(draftRef.current)
      const result = await window.speechToTextApi.runScratchSpaceTransformation({
        text: draftRef.current,
        presetId: selectedPresetId
      })
      if (result.status === 'error') {
        setError(result.message)
        setNotice('Scratch space is still open so you can revise the draft.')
        return
      }

      draftRef.current = ''
      setDraft('')
      setNotice(result.message)
      setError('')
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBootstrap()

    const unlistenSettingsUpdated = window.speechToTextApi.onSettingsUpdated(() => {
      void refreshBootstrap({ keepDraft: true })
    })
    const unlistenOpenScratchSpace = window.speechToTextApi.onOpenScratchSpace(() => {
      void refreshBootstrap()
    })

    return () => {
      unlistenSettingsUpdated()
      unlistenOpenScratchSpace()
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      cleanupRecordingResources()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void persistDraftNow(draftRef.current).then(async () => {
          if (isRecording) {
            await cancelRecording()
          }
          await window.speechToTextApi.hideScratchSpaceWindow()
        })
        return
      }

      if (event.key === 'Enter' && event.metaKey) {
        event.preventDefault()
        void runTransformation()
      }
    }

    const onBlur = (): void => {
      void persistDraftNow(draftRef.current)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [isBusy, isRecording, selectedPresetId, settings])

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading scratch space…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(60,180,120,0.22),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0))] bg-background px-4 py-4 text-foreground">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden rounded-[1.4rem] border border-white/8 bg-[rgba(11,14,19,0.94)] shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="app-region-drag flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-primary/80">Scratch Space</p>
            <h1 className="mt-1 text-base font-semibold text-foreground">Draft, transform, and paste in one pass.</h1>
          </div>
          <div className="app-region-no-drag rounded-full border border-white/10 bg-white/4 px-3 py-1 text-[11px] text-muted-foreground">
            Esc closes · Cmd+Enter runs
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_240px] gap-4 p-4">
          <section className="flex min-h-0 flex-col rounded-[1.1rem] border border-white/8 bg-black/15 p-3">
            <label htmlFor="scratch-space-draft" className="mb-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Draft
            </label>
            <textarea
              ref={textareaRef}
              id="scratch-space-draft"
              value={draft}
              onChange={(event) => {
                applyDraft(event.target.value)
                setError('')
              }}
              placeholder="Type here or dictate into the draft window."
              className="min-h-0 flex-1 resize-none rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
            />
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{draft.trim().length === 0 ? 'Draft is empty.' : `${draft.length} characters saved locally.`}</span>
              <span>{settings.transformation.presets.length} profile{settings.transformation.presets.length === 1 ? '' : 's'}</span>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.015))] p-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Profiles</p>
              <select
                id="scratch-space-profile-list"
                size={Math.max(3, Math.min(6, settings.transformation.presets.length))}
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="mt-2 h-auto w-full rounded-[0.9rem] border border-white/8 bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/60"
              >
                {settings.transformation.presets.map((preset) => (
                  <option key={preset.id} value={preset.id} className="bg-[#111318] py-1">
                    {preset.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Arrow keys work here. Scratch space always opens with the default profile selected.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  void stopRecording()
                } else {
                  void startRecording()
                }
              }}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-[0.95rem] border border-white/10 bg-[rgba(60,180,120,0.12)] px-4 py-3 text-sm font-medium text-foreground transition hover:bg-[rgba(60,180,120,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRecording ? <Square className="size-4" /> : <Mic className="size-4" />}
              {isRecording ? 'Stop dictation' : 'Dictate into draft'}
            </button>

            <button
              type="button"
              onClick={() => {
                void runTransformation()
              }}
              disabled={isBusy || isRecording}
              className="flex items-center justify-center gap-2 rounded-[0.95rem] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <WandSparkles className="size-4" />
              Transform and paste
            </button>

            <div className="mt-auto rounded-[0.95rem] border border-white/8 bg-black/18 px-3 py-3 text-[11px] leading-5">
              <p className="text-muted-foreground">{notice}</p>
              {error ? <p className="mt-2 text-destructive">{error}</p> : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export const startScratchSpaceApp = (target?: HTMLDivElement): void => {
  const mountPoint = target ?? document.querySelector<HTMLDivElement>('#app')
  if (!mountPoint) {
    return
  }

  if (!appRoot) {
    appRoot = createRoot(mountPoint)
  }

  appRoot.render(<ScratchSpaceApp />)
}

export const stopScratchSpaceAppForTests = (): void => {
  appRoot?.unmount()
  appRoot = null
}
