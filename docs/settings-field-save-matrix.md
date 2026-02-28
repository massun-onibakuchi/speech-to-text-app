<!--
Where: docs/settings-field-save-matrix.md
What: Save-ownership matrix for settings fields under ticket #224.
Why: Define which fields autosave vs manual-save to keep behavior explicit and testable.
-->

# Settings Field Save Matrix (#224)

## Scope
- Date: February 28, 2026
- In scope: non-API-key settings fields in Shortcuts and Settings tabs
- Out of scope: API key values and API key validation/save flow

## Save Policy
- Debounced autosave window for non-secret fields: `450ms`.
- Autosave target: `window.speechToTextApi.setSettings(...)`.
- Validation failure policy: block autosave in renderer for invalid non-API values, keep the last persisted valid snapshot unchanged, and surface inline + save feedback.

| Area | Field(s) | Save Mode | Notes |
|---|---|---|---|
| Output | `selectedTextSource`, destination toggles (`copyToClipboard`, `pasteAtCursor`) | Autosave | Applies on toggle/radio change. |
| Speech-to-Text | provider, model, base URL override | Autosave | Provider/model changes persist immediately (debounced). Invalid base URL values are blocked by renderer validation and not persisted. |
| LLM Transformation | base URL override (default preset provider) | Autosave | Invalid URL values are blocked by renderer validation and not persisted. |
| Audio Input | recording method, sample rate, audio device | Autosave | Device selection updates `autoDetectAudioSource` and `detectedAudioSource` before autosave. |
| Shortcuts | all shortcut bindings | Autosave | No Enter-to-save coupling; edits persist automatically (debounced). |
| API keys | provider API keys (Groq, ElevenLabs, Google) | Manual Save | Explicit provider-level `Save` action remains; includes connection validation before persistence. |

## UI Contract
- No non-API `Save Settings` control is rendered in Shortcuts or Settings tabs.
- Enter key is not required for non-API settings persistence.
- API key save controls remain manual and separate from autosave behavior.
