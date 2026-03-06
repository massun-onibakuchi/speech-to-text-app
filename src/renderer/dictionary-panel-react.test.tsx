/*
Where: src/renderer/dictionary-panel-react.test.tsx
What: Component tests for dictionary CRUD panel behavior.
Why: Lock add/update/remove interactions and validation without modal confirmation.
*/

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
import { DictionaryPanelReact } from './dictionary-panel-react'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const updateInput = async (input: HTMLInputElement, value: string): Promise<void> => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!valueSetter) {
    throw new Error('Unable to resolve HTMLInputElement value setter')
  }
  valueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

const blurOutOfRow = async (input: HTMLElement): Promise<void> => {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
  await flush()
}

const blurWithinRow = async (input: HTMLElement, relatedTarget: HTMLElement): Promise<void> => {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }))
  await flush()
}

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

const buildSettings = (entries: Settings['correction']['dictionary']['entries']): Settings => ({
  ...DEFAULT_SETTINGS,
  correction: {
    dictionary: {
      entries
    }
  }
})

describe('DictionaryPanelReact', () => {
  it('renders entries sorted alphabetically by key', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([
          { key: 'zeta', value: 'Zeta' },
          { key: 'Alpha', value: 'Alpha' }
        ])}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const labels = Array.from(host.querySelectorAll<HTMLInputElement>('input[aria-label^="Key for "]')).map(
      (node) => node.value.trim()
    )
    expect(labels).toEqual(['Alpha', 'zeta'])
  })

  it('adds a new entry when key/value are valid', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpsertEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([])}
        onAddEntry={onUpsertEntry}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const keyInput = host.querySelector<HTMLInputElement>('#dictionary-new-key')
    const valueInput = host.querySelector<HTMLInputElement>('#dictionary-new-value')
    const addButton = host.querySelector<HTMLButtonElement>('#dictionary-add')
    if (!keyInput || !valueInput || !addButton) {
      throw new Error('dictionary add controls are missing')
    }

    await updateInput(keyInput, 'teh')
    await updateInput(valueInput, 'the')
    addButton.click()
    await flush()

    expect(onUpsertEntry).toHaveBeenCalledWith('teh', 'the')
  })

  it('updates an existing entry key and value on row blur', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpdateEntry = vi.fn().mockResolvedValue(true)

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const rowKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    const rowValue = host.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    if (!rowKey || !rowValue) {
      throw new Error('dictionary row controls are missing')
    }
    await updateInput(rowKey, 'Teh')
    await updateInput(rowValue, 'THE')
    await blurOutOfRow(rowValue)

    expect(onUpdateEntry).toHaveBeenCalledWith('teh', 'Teh', 'THE')
  })

  it('deletes entry immediately without confirmation step', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onDeleteEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={onDeleteEntry}
      />
    )
    await flush()

    const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete dictionary entry teh"]')
    if (!deleteButton) {
      throw new Error('dictionary delete button is missing')
    }
    deleteButton.click()
    await flush()

    expect(onDeleteEntry).toHaveBeenCalledWith('teh')
  })

  it('does not save when focus moves within the same row', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpdateEntry = vi.fn().mockResolvedValue(true)

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const rowKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    const rowValue = host.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    if (!rowKey || !rowValue) {
      throw new Error('dictionary row controls are missing')
    }

    await updateInput(rowKey, 'Teh')
    await blurWithinRow(rowKey, rowValue)

    expect(onUpdateEntry).not.toHaveBeenCalled()
  })

  it('preserves in-progress row drafts across same-key settings refresh', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const rowKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    if (!rowKey) {
      throw new Error('dictionary key input is missing')
    }
    await updateInput(rowKey, 'Teh')

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const refreshedKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    expect(refreshedKey?.value).toBe('Teh')
  })

  it('blocks invalid renamed keys on blur', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpdateEntry = vi.fn().mockResolvedValue(true)

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([
          { key: 'teh', value: 'the' },
          { key: 'gpt', value: 'GPT' }
        ])}
        onAddEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const rowKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    if (!rowKey) {
      throw new Error('dictionary key input is missing')
    }

    await updateInput(rowKey, 'GPT')
    await blurOutOfRow(rowKey)

    expect(onUpdateEntry).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Key already exists (case-insensitive).')
  })

  it('blocks adding keys longer than 128 chars', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpsertEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([])}
        onAddEntry={onUpsertEntry}
        onUpdateEntry={vi.fn().mockResolvedValue(true)}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const keyInput = host.querySelector<HTMLInputElement>('#dictionary-new-key')
    const valueInput = host.querySelector<HTMLInputElement>('#dictionary-new-value')
    const addButton = host.querySelector<HTMLButtonElement>('#dictionary-add')
    if (!keyInput || !valueInput || !addButton) {
      throw new Error('dictionary add controls are missing')
    }

    await updateInput(keyInput, 'x'.repeat(129))
    await updateInput(valueInput, 'valid')
    addButton.click()
    await flush()

    expect(onUpsertEntry).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Key must be 128 characters or fewer.')
  })

  it('removes the row Save button and lets Delete bypass dirty row blur save', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpdateEntry = vi.fn().mockResolvedValue(true)
    const onDeleteEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onAddEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={onDeleteEntry}
      />
    )
    await flush()

    expect(host.querySelector('#dictionary-save-0')).toBeNull()

    const rowKey = host.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete dictionary entry teh"]')
    if (!rowKey || !deleteButton) {
      throw new Error('dictionary row controls are missing')
    }

    await updateInput(rowKey, '')
    await blurWithinRow(rowKey, deleteButton)
    deleteButton.click()
    await flush()

    expect(onUpdateEntry).not.toHaveBeenCalled()
    expect(onDeleteEntry).toHaveBeenCalledWith('teh')
  })
})
