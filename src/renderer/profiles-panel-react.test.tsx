/*
 * Where: src/renderer/profiles-panel-react.test.tsx
 * What: Component tests for the STY-05 profiles panel — card list and inline edit.
 * Why: Guard card rendering, default badge, hover-action dispatch, inline form interaction,
 *      and Save/Cancel/Add button wiring.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type TransformationPreset } from '../shared/domain'
import type { Settings } from '../shared/domain'
import { ProfilesPanelReact } from './profiles-panel-react'

// Radix Select uses pointer-capture and scroll APIs that are missing in jsdom.
const originalHasPointerCapture = Element.prototype.hasPointerCapture
const originalSetPointerCapture = Element.prototype.setPointerCapture
const originalReleasePointerCapture = Element.prototype.releasePointerCapture
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
})

afterAll(() => {
  Element.prototype.hasPointerCapture = originalHasPointerCapture
  Element.prototype.setPointerCapture = originalSetPointerCapture
  Element.prototype.releasePointerCapture = originalReleasePointerCapture
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView
})

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

// Two presets for multi-preset tests
const PRESET_A: TransformationPreset = {
  id: 'preset-a',
  name: 'Alpha',
  provider: 'google',
  model: 'gemini-2.5-flash',
  systemPrompt: 'System A',
  userPrompt: 'User {{text}}',
  shortcut: ''
}

const PRESET_B: TransformationPreset = {
  id: 'preset-b',
  name: 'Beta',
  provider: 'google',
  model: 'gemini-2.5-flash',
  systemPrompt: 'System B',
  userPrompt: 'User B {{text}}',
  shortcut: ''
}

const buildSettings = (overrides: Partial<Settings['transformation']> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  transformation: {
    ...DEFAULT_SETTINGS.transformation,
    defaultPresetId: 'preset-a',
    lastPickedPresetId: null,
    presets: [PRESET_A, PRESET_B],
    ...overrides
  }
})

const buildCallbacks = () => ({
  settingsValidationErrors: {},
  onSelectDefaultPreset: vi.fn(),
  onSavePresetDraft: vi.fn().mockResolvedValue(true),
  onAddPreset: vi.fn(),
  onRemovePreset: vi.fn()
})

describe('ProfilesPanelReact (STY-05)', () => {
  it('renders a card for each preset', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    const cards = host.querySelectorAll('[role="listitem"]')
    expect(cards.length).toBe(2)
    expect(host.textContent).toContain('Alpha')
    expect(host.textContent).toContain('Beta')
  })

  it('shows default badge on the default preset', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ defaultPresetId: 'preset-a' })}
        {...buildCallbacks()}
      />
    )
    await flush()

    // There should be exactly one "default" badge
    const badges = host.querySelectorAll('[class*="bg-primary/10"]')
    expect(badges.length).toBe(1)
    expect(badges[0].textContent).toContain('default')
  })

  it('opens inline edit form when a card is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    // No edit form initially
    expect(host.querySelector('#profile-edit-name')).toBeNull()

    // Click the first card (Alpha)
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    // Edit form should now be visible with Alpha's values
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    expect(nameInput?.value).toBe('Alpha')
  })

  it('opens inline edit form on Enter and Space keyboard activation', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    expect(firstCard).not.toBeNull()

    firstCard?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(host.querySelector('#profile-edit-name')).not.toBeNull()

    const cancelBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel')
    cancelBtn?.click()
    await flush()
    expect(host.querySelector('#profile-edit-name')).toBeNull()

    firstCard?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    await flush()
    expect(host.querySelector('#profile-edit-name')).not.toBeNull()
  })

  it('does not change default when opening edit on a non-default card', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ defaultPresetId: 'preset-a' })}
        {...cbs}
      />
    )
    await flush()

    // Click the Beta card (non-default)
    const buttons = host.querySelectorAll<HTMLDivElement>('[role="button"]')
    const betaCard = Array.from(buttons).find((el) => el.textContent?.includes('Beta'))
    betaCard?.click()
    await flush()

    expect(cbs.onSelectDefaultPreset).not.toHaveBeenCalled()
  })

  it('does NOT call onSelectDefaultPreset when clicking the already-default card', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ defaultPresetId: 'preset-a' })}
        {...cbs}
      />
    )
    await flush()

    // Click the Alpha card (already default)
    const buttons = host.querySelectorAll<HTMLDivElement>('[role="button"]')
    const alphaCard = Array.from(buttons).find((el) => el.textContent?.includes('Alpha'))
    alphaCard?.click()
    await flush()

    expect(cbs.onSelectDefaultPreset).not.toHaveBeenCalled()
  })

  it('calls onSavePresetDraft and closes form when Save succeeds', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    // Open Alpha card
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    expect(host.querySelector('#profile-edit-name')).not.toBeNull()

    // Click Save
    const saveBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save')
    saveBtn?.click()
    await flush()

    expect(cbs.onSavePresetDraft).toHaveBeenCalledWith('preset-a', {
      name: 'Alpha',
      model: 'gemini-2.5-flash',
      systemPrompt: 'System A',
      userPrompt: 'User {{text}}'
    })
    // Form should be closed after save
    expect(host.querySelector('#profile-edit-name')).toBeNull()
  })

  it('persists multiline user prompt content when saving a profile draft', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    const userPromptArea = host.querySelector<HTMLTextAreaElement>('#profile-edit-user-prompt')
    expect(userPromptArea).not.toBeNull()
    if (userPromptArea) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      valueSetter?.call(userPromptArea, 'Line 1\nLine 2 {{text}}')
      userPromptArea.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    const saveBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save')
    saveBtn?.click()
    await flush()

    expect(cbs.onSavePresetDraft).toHaveBeenCalledWith('preset-a', {
      name: 'Alpha',
      model: 'gemini-2.5-flash',
      systemPrompt: 'System A',
      userPrompt: 'Line 1\nLine 2 {{text}}'
    })
  })

  it('closes form without calling onSavePresetDraft when Cancel is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    // Open edit form
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    // Click Cancel
    const cancelBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel')
    cancelBtn?.click()
    await flush()

    expect(cbs.onSavePresetDraft).not.toHaveBeenCalled()
    expect(host.querySelector('#profile-edit-name')).toBeNull()
  })

  it('calls onRemovePreset when trash button is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    // The trash button has aria-label "Remove Alpha profile"
    const trashBtn = host.querySelector<HTMLButtonElement>('[aria-label="Remove Alpha profile"]')
    expect(trashBtn).not.toBeNull()
    trashBtn?.click()
    await flush()

    expect(cbs.onRemovePreset).toHaveBeenCalledWith('preset-a')
  })

  it('calls onSelectDefaultPreset when star button is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ defaultPresetId: 'preset-a' })}
        {...cbs}
      />
    )
    await flush()

    const setDefaultBtn = host.querySelector<HTMLButtonElement>('[aria-label="Set Beta as default profile"]')
    expect(setDefaultBtn).not.toBeNull()
    setDefaultBtn?.click()
    await flush()

    expect(cbs.onSelectDefaultPreset).toHaveBeenCalledWith('preset-b')
  })

  it('does not open inline editor when Enter is pressed on nested star button', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ defaultPresetId: 'preset-a' })}
        {...cbs}
      />
    )
    await flush()

    const setDefaultBtn = host.querySelector<HTMLButtonElement>('[aria-label="Set Beta as default profile"]')
    expect(setDefaultBtn).not.toBeNull()
    setDefaultBtn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()

    expect(host.querySelector('#profile-edit-name')).toBeNull()
  })

  it('does not persist field changes until Save is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    const betaCard = Array.from(host.querySelectorAll<HTMLDivElement>('[role="button"]')).find((el) => el.textContent?.includes('Beta'))
    betaCard?.click()
    await flush()

    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    if (nameInput) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(nameInput, 'Beta 2')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    expect(cbs.onSavePresetDraft).not.toHaveBeenCalled()
  })

  it('keeps editor open when save fails', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    cbs.onSavePresetDraft.mockResolvedValue(false)
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    const saveBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save')
    saveBtn?.click()
    await flush()

    expect(cbs.onSavePresetDraft).toHaveBeenCalledTimes(1)
    expect(host.querySelector('#profile-edit-name')).not.toBeNull()
  })

  it('reopens with original values after canceling local edits', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    const betaCard = Array.from(host.querySelectorAll<HTMLDivElement>('[role="button"]')).find((el) => el.textContent?.includes('Beta'))
    betaCard?.click()
    await flush()

    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    if (nameInput) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(nameInput, 'Beta Edited')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    const cancelBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel')
    cancelBtn?.click()
    await flush()

    betaCard?.click()
    await flush()
    expect(host.querySelector<HTMLInputElement>('#profile-edit-name')?.value).toBe('Beta')
  })

  it('calls onAddPreset when Add profile button is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...cbs}
      />
    )
    await flush()

    const addBtn = host.querySelector<HTMLButtonElement>('#profiles-panel-add')
    expect(addBtn).not.toBeNull()
    addBtn?.click()
    await flush()

    expect(cbs.onAddPreset).toHaveBeenCalledTimes(1)
  })

  it('auto-opens the newly added profile editor even when default profile stays unchanged', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const cbs = buildCallbacks()
    const initialSettings = buildSettings({ defaultPresetId: 'preset-a' })
    root.render(
      <ProfilesPanelReact
        settings={initialSettings}
        {...cbs}
      />
    )
    await flush()

    expect(host.querySelector('#profile-edit-name')).toBeNull()

    const addedSettings = buildSettings({
      defaultPresetId: 'preset-a',
      presets: [
        ...initialSettings.transformation.presets,
        {
          ...PRESET_A,
          id: 'preset-c',
          name: 'Gamma',
          systemPrompt: 'System C',
          userPrompt: 'User C {{text}}'
        }
      ]
    })
    root.render(
      <ProfilesPanelReact
        settings={addedSettings}
        {...cbs}
      />
    )
    await flush()

    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    expect(nameInput?.value).toBe('Gamma')
  })

  it('renders Add profile directly after the profile list items in the same scroll region', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    const listContainer = host.querySelector<HTMLElement>('[role="list"]')
    const addBtn = host.querySelector<HTMLButtonElement>('#profiles-panel-add')
    expect(listContainer).not.toBeNull()
    expect(addBtn).not.toBeNull()
    expect(addBtn?.closest('[role="list"]')).toBe(listContainer)

    const listItems = Array.from(host.querySelectorAll('[role="listitem"]'))
    const lastListItem = listItems[listItems.length - 1]
    const addIsAfterLastItem = (lastListItem?.compareDocumentPosition(addBtn as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(addIsAfterLastItem).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('renders Add profile in the list container even when there are no profile items', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings({ presets: [], defaultPresetId: 'missing-default' })}
        {...buildCallbacks()}
      />
    )
    await flush()

    const listContainer = host.querySelector<HTMLElement>('[role="list"]')
    const addBtn = host.querySelector<HTMLButtonElement>('#profiles-panel-add')
    expect(host.querySelectorAll('[role="listitem"]').length).toBe(0)
    expect(listContainer).not.toBeNull()
    expect(addBtn).not.toBeNull()
    expect(addBtn?.closest('[role="list"]')).toBe(listContainer)
  })

  it('renders provider/model metadata in font-mono footer per spec section 6.4', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    // Each card footer should contain "google/gemini-2.5-flash"
    expect(host.textContent).toContain('google/gemini-2.5-flash')
  })

  it('populates edit form fields with the preset values when opened', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    // Open Alpha card
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    // All four editable fields should reflect PRESET_A values
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    const modelTrigger = host.querySelector<HTMLElement>('#profile-edit-model')
    const systemPromptArea = host.querySelector<HTMLTextAreaElement>('#profile-edit-system-prompt')
    const userPromptInput = host.querySelector<HTMLTextAreaElement>('#profile-edit-user-prompt')

    expect(nameInput?.value).toBe('Alpha')
    expect(modelTrigger?.textContent).toContain('gemini-2.5-flash')
    expect(systemPromptArea?.value).toBe('System A')
    expect(userPromptInput?.value).toBe('User {{text}}')
  })

  it('wires validation errors to form controls with aria attributes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        settingsValidationErrors={{
          presetName: 'Profile name is required.',
          systemPrompt: 'System prompt is required.',
          userPrompt: 'User prompt must include {{text}}.'
        }}
        onSelectDefaultPreset={vi.fn()}
        onSavePresetDraft={vi.fn().mockResolvedValue(false)}
        onAddPreset={vi.fn()}
        onRemovePreset={vi.fn()}
      />
    )
    await flush()

    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    const systemPromptArea = host.querySelector<HTMLTextAreaElement>('#profile-edit-system-prompt')
    const userPromptInput = host.querySelector<HTMLTextAreaElement>('#profile-edit-user-prompt')

    expect(nameInput?.getAttribute('aria-invalid')).toBe('true')
    expect(nameInput?.getAttribute('aria-describedby')).toContain('profile-edit-name-error-')
    expect(systemPromptArea?.getAttribute('aria-invalid')).toBe('true')
    expect(systemPromptArea?.getAttribute('aria-describedby')).toContain('profile-edit-system-prompt-error-')
    expect(userPromptInput?.getAttribute('aria-invalid')).toBe('true')
    expect(userPromptInput?.getAttribute('aria-describedby')).toContain('profile-edit-user-prompt-error-')
  })

  // Issue #255: style regression guard — edit-form select triggers must preserve token classes.
  it('renders edit-form provider and model select triggers with standardized token classes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    // Open the edit form
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    const providerTrigger = host.querySelector<HTMLElement>('#profile-edit-provider[data-slot="select-trigger"]')!
    const modelTrigger = host.querySelector<HTMLElement>('#profile-edit-model[data-slot="select-trigger"]')!

    for (const [id, el] of [['provider', providerTrigger], ['model', modelTrigger]] as const) {
      expect(el.className, `${id} should have w-full`).toContain('w-full')
      expect(el.className, `${id} should have rounded-md`).toContain('rounded-md')
      expect(el.className, `${id} should have bg-input/30`).toContain('bg-input/30')
    }
    // Model trigger has hover/focus; provider is disabled so no hover/focus required
    expect(modelTrigger.className).toContain('focus-visible:ring-2')
  })

  it('opens radix select content in portal and exposes options in document.body', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    // Open the edit form.
    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    // Open model combobox; Radix renders content in a portal under document.body.
    const modelTrigger = host.querySelector<HTMLElement>('#profile-edit-model')
    expect(modelTrigger).not.toBeNull()
    modelTrigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    modelTrigger?.click()
    await flush()

    const listbox = document.body.querySelector('[role="listbox"]')
    const optionTexts = Array.from(document.body.querySelectorAll('[role="option"]')).map((el) => el.textContent?.trim())

    expect(listbox).not.toBeNull()
    expect(optionTexts).toContain('gemini-2.5-flash')
  })

  it('renders provider select trigger as disabled', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ProfilesPanelReact
        settings={buildSettings()}
        {...buildCallbacks()}
      />
    )
    await flush()

    const firstCard = host.querySelector<HTMLDivElement>('[role="button"]')
    firstCard?.click()
    await flush()

    const providerTrigger = host.querySelector<HTMLButtonElement>('#profile-edit-provider[data-slot="select-trigger"]')
    expect(providerTrigger).not.toBeNull()
    expect(providerTrigger?.disabled || providerTrigger?.hasAttribute('data-disabled')).toBe(true)
  })
})
