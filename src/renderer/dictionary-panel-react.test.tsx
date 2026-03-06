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
        onUpsertEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const labels = Array.from(host.querySelectorAll('li span')).map((node) => node.textContent?.trim())
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
        onUpsertEntry={onUpsertEntry}
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

  it('updates an existing entry value from row Save button', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpsertEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onUpsertEntry={onUpsertEntry}
        onDeleteEntry={vi.fn()}
      />
    )
    await flush()

    const rowValue = host.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    const saveButton = host.querySelector<HTMLButtonElement>('#dictionary-save-0')
    if (!rowValue || !saveButton) {
      throw new Error('dictionary row controls are missing')
    }
    await updateInput(rowValue, 'THE')
    saveButton.click()
    await flush()

    expect(onUpsertEntry).toHaveBeenCalledWith('teh', 'THE')
  })

  it('deletes entry immediately without confirmation step', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onDeleteEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([{ key: 'teh', value: 'the' }])}
        onUpsertEntry={vi.fn()}
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

  it('blocks adding keys longer than 128 chars', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onUpsertEntry = vi.fn()

    root.render(
      <DictionaryPanelReact
        settings={buildSettings([])}
        onUpsertEntry={onUpsertEntry}
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
})
