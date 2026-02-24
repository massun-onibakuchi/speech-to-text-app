/*
Where: src/renderer/settings-shortcut-editor-react.test.tsx
What: Component tests for React-rendered editable shortcut fields in Settings.
Why: Guard callback ownership while removing legacy shortcut input wiring from string templates.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { SettingsShortcutEditorReact } from './settings-shortcut-editor-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

const setReactInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsShortcutEditorReact', () => {
  it('propagates shortcut edits through callback with preserved selector ids', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{ startRecording: 'Start recording shortcut is required.' }}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })
    expect(host.querySelector<HTMLElement>('#settings-error-start-recording')?.textContent).toBe(
      'Start recording shortcut is required.'
    )

    const startRecordingInput = host.querySelector<HTMLInputElement>('#settings-shortcut-start-recording')
    await act(async () => {
      setReactInputValue(startRecordingInput!, 'Cmd+Shift+1')
    })
    expect(onChangeShortcutDraft).toHaveBeenCalledWith('startRecording', 'Cmd+Shift+1')

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      setReactInputValue(runTransformInput!, 'Cmd+Shift+9')
    })
    expect(onChangeShortcutDraft).toHaveBeenCalledWith('runTransform', 'Cmd+Shift+9')
  })

  it('updates shortcut validation messages on rerendered props', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-start-recording')?.textContent).toBe('')
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toBe('')

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{
            startRecording: 'Start recording shortcut is required.',
            runTransform: 'Run transform shortcut is required.'
          }}
          onChangeShortcutDraft={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-start-recording')?.textContent).toContain('shortcut is required')
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('shortcut is required')
  })
})
