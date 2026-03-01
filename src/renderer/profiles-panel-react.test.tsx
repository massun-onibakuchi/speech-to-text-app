/*
 * Where: src/renderer/profiles-panel-react.test.tsx
 * What: Component tests for the STY-05 profiles panel — card list and inline edit.
 * Why: Guard card rendering, default badge, hover-action dispatch, inline form interaction,
 *      and Save/Cancel/Add button wiring.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type TransformationPreset } from '../shared/domain'
import type { Settings } from '../shared/domain'
import { ProfilesPanelReact } from './profiles-panel-react'

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
    const modelSelect = host.querySelector<HTMLSelectElement>('#profile-edit-model')
    const systemPromptArea = host.querySelector<HTMLTextAreaElement>('#profile-edit-system-prompt')
    const userPromptInput = host.querySelector<HTMLInputElement>('#profile-edit-user-prompt')

    expect(nameInput?.value).toBe('Alpha')
    expect(modelSelect?.value).toBe('gemini-2.5-flash')
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
    const userPromptInput = host.querySelector<HTMLInputElement>('#profile-edit-user-prompt')

    expect(nameInput?.getAttribute('aria-invalid')).toBe('true')
    expect(nameInput?.getAttribute('aria-describedby')).toContain('profile-edit-name-error-')
    expect(systemPromptArea?.getAttribute('aria-invalid')).toBe('true')
    expect(systemPromptArea?.getAttribute('aria-describedby')).toContain('profile-edit-system-prompt-error-')
    expect(userPromptInput?.getAttribute('aria-invalid')).toBe('true')
    expect(userPromptInput?.getAttribute('aria-describedby')).toContain('profile-edit-user-prompt-error-')
  })
})
