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

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsShortcutEditorReact', () => {
  it('renders shortcut title and keybind input in one horizontal row', async () => {
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

    const label = host.querySelector<HTMLElement>('#settings-shortcut-toggle-recording-label')
    const input = host.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')
    const row = label?.parentElement

    expect(label).not.toBeNull()
    expect(input).not.toBeNull()
    expect(row?.className).toContain('grid')
    expect(row?.className).toContain('items-center')
    expect(row?.className).toContain('gap-3')
    expect(label?.nextElementSibling).toBe(input)
    expect(input?.className).toContain('w-full')
  })

  it('captures a key combo from recording mode and propagates shortcut edits', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })

    const toggleRecordingInput = host.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')
    await act(async () => {
      toggleRecordingInput?.click()
    })
    await act(async () => {
      toggleRecordingInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: '3', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
      )
    })
    expect(onChangeShortcutDraft).toHaveBeenCalledWith('toggleRecording', 'Ctrl+Shift+3')
    expect(toggleRecordingInput?.value).toBe('Ctrl+Shift+3')
    expect(host.querySelector('[data-shortcut-capture-hint="toggleRecording"]')).toBeNull()
  })

  it('rejects no-modifier and duplicate capture attempts, and supports escape cancel', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: '9', bubbles: true, cancelable: true })
      )
    })
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('at least one modifier key')

    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'T', metaKey: true, altKey: true, bubbles: true, cancelable: true })
      )
    })
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('already assigned')

    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
    expect(onChangeShortcutDraft).not.toHaveBeenCalledWith('runTransform', expect.anything())
  })

  it('clears stale capture error when recording starts for a different shortcut', async () => {
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: '9', bubbles: true, cancelable: true })
      )
    })
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('at least one modifier key')

    const toggleRecordingInput = host.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')
    await act(async () => {
      toggleRecordingInput?.click()
    })

    expect(host.querySelector('#settings-error-run-transform')?.textContent).toBe('')
  })

  it('does not start capture mode when field is focused via keyboard navigation', async () => {
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

    const toggleRecordingInput = host.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')
    await act(async () => {
      toggleRecordingInput?.focus()
      toggleRecordingInput?.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })
    expect(host.querySelector('[data-shortcut-capture-hint="toggleRecording"]')).toBeNull()
  })

  it('starts capture from keyboard using Enter on a focused shortcut input', async () => {
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

    const toggleRecordingInput = host.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')
    await act(async () => {
      toggleRecordingInput?.focus()
      toggleRecordingInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    })

    expect(host.querySelector('[data-shortcut-capture-hint="toggleRecording"]')).not.toBeNull()
  })

  it('starts capture from keyboard using Space on a focused shortcut input', async () => {
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.focus()
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      )
    })

    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()
  })

  it('cancels capture mode when clicking outside the shortcut editor', async () => {
    const host = document.createElement('div')
    const outside = document.createElement('button')
    outside.type = 'button'
    document.body.append(host, outside)
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    await act(async () => {
      outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('cancels capture mode when focus moves outside the shortcut editor', async () => {
    const host = document.createElement('div')
    const outsideInput = document.createElement('input')
    document.body.append(host, outsideInput)
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    await act(async () => {
      outsideInput.focus()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('cancels capture mode on active field blur in the same render tick', async () => {
    const host = document.createElement('div')
    const outsideInput = document.createElement('input')
    document.body.append(host, outsideInput)
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    await act(async () => {
      runTransformInput?.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: outsideInput }))
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('cancels capture mode when window loses focus', async () => {
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

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('does not render Record buttons in shortcut editor', async () => {
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

    const recordButton = host.querySelector<HTMLButtonElement>('[data-shortcut-capture-toggle]')
    expect(recordButton).toBeNull()
  })

  it('does not start capture when shortcut title text is clicked', async () => {
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

    const runTransformTitle = host.querySelector<HTMLElement>('#settings-shortcut-run-transform-label')
    expect(runTransformTitle?.textContent).toBe('Run transform shortcut')

    await act(async () => {
      runTransformTitle?.click()
    })

    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('captures shortcut after clicking the shortcut input field', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    expect(runTransformInput).not.toBeNull()

    await act(async () => {
      runTransformInput?.click()
    })

    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: '9', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(onChangeShortcutDraft).toHaveBeenCalledWith('runTransform', 'Ctrl+Shift+9')
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
  })

  it('publishes capture active state changes for renderer-level command suppression', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onCaptureStateChange = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
          onCaptureStateChange={onCaptureStateChange}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(onCaptureStateChange).toHaveBeenCalledWith(true)

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(onCaptureStateChange).toHaveBeenCalledWith(false)
  })

  it('clears capture-active signal when settings props rerender during capture', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onCaptureStateChange = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
          onCaptureStateChange={onCaptureStateChange}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    const updatedSettings = structuredClone(DEFAULT_SETTINGS)
    updatedSettings.shortcuts.toggleRecording = 'Cmd+Shift+9'

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={updatedSettings}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
          onCaptureStateChange={onCaptureStateChange}
        />
      )
    })

    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
    expect(onCaptureStateChange).toHaveBeenCalledWith(false)
  })

  it('captures Option-modified letter shortcuts using semantic base key labels', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })

    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'π',
          code: 'KeyP',
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })

    expect(onChangeShortcutDraft).toHaveBeenCalledWith('runTransform', 'Opt+P')
    expect(runTransformInput?.value).toBe('Opt+P')
  })

  it('cancels capture on Escape even when modifiers are held', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeShortcutDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{}}
          onChangeShortcutDraft={onChangeShortcutDraft}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).not.toBeNull()

    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', metaKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(host.querySelector('[data-shortcut-capture-hint="runTransform"]')).toBeNull()
    expect(onChangeShortcutDraft).not.toHaveBeenCalled()
  })

  it('blocks duplicate capture when an equivalent alias/order combo already exists', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.shortcuts.runTransformOnSelection = 'Option+Command+K'

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={settings}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, altKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('already assigned')
  })

  it('blocks duplicate capture when existing setting uses legacy Option-symbol representation', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.shortcuts.runTransformOnSelection = 'Opt+π'

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={settings}
          validationErrors={{}}
          onChangeShortcutDraft={() => {}}
        />
      )
    })

    const runTransformInput = host.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')
    await act(async () => {
      runTransformInput?.click()
    })
    await act(async () => {
      runTransformInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'π', code: 'KeyP', altKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('already assigned')
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
    expect(host.querySelector('#settings-error-toggle-recording')?.textContent).toBe('')
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toBe('')

    await act(async () => {
      root?.render(
        <SettingsShortcutEditorReact
          settings={DEFAULT_SETTINGS}
          validationErrors={{
            toggleRecording: 'Toggle recording shortcut is required.',
            runTransform: 'Run transform shortcut is required.'
          }}
          onChangeShortcutDraft={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-toggle-recording')?.textContent).toContain('shortcut is required')
    expect(host.querySelector('#settings-error-run-transform')?.textContent).toContain('shortcut is required')
  })

})
