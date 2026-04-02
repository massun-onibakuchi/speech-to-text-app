/*
Where: src/renderer/settings-google-gemini-access-react.test.tsx
What: Component tests for the Google/Gemini STT-style access wrapper.
Why: Guard the provider -> model -> key layout without relying on Radix portal behavior.
*/

// @vitest-environment jsdom

vi.mock('./components/ui/select', () => {
  const React = require('react')

  const Select = ({ value, onValueChange, disabled, children }: {
    value?: string
    onValueChange?: (val: string) => void
    disabled?: boolean
    children?: React.ReactNode
  }) => {
    const optionChildren = React.Children.toArray(children).filter((child: any) => {
      return child?.type?.displayName !== 'SelectTrigger'
    })

    return React.createElement('select', {
      'data-select-root': 'true',
      value,
      disabled,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value)
    }, optionChildren)
  }

  const SelectTrigger = React.forwardRef(
    ({ id, 'data-testid': testId, className, disabled, children, ...rest }: any, ref: any) =>
      React.createElement('button', {
        ref,
        id,
        'data-testid': testId,
        'data-slot': 'select-trigger',
        className,
        disabled,
        ...rest
      }, children)
  )
  SelectTrigger.displayName = 'SelectTrigger'

  const SelectContent = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  SelectContent.displayName = 'SelectContent'

  const SelectValue = () => null
  SelectValue.displayName = 'SelectValue'

  const SelectItem = ({
    value,
    disabled,
    children,
    className
  }: {
    value: string
    disabled?: boolean
    children?: React.ReactNode
    className?: string
  }) => React.createElement('option', { value, disabled, className }, children)
  SelectItem.displayName = 'SelectItem'

  return {
    Select,
    SelectTrigger,
    SelectContent,
    SelectValue,
    SelectItem
  }
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsGoogleGeminiAccessReact } from './settings-google-gemini-access-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsGoogleGeminiAccessReact', () => {
  it('renders provider and model selects above the Google key input', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsGoogleGeminiAccessReact
          apiKeyStatus={{ groq: false, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
        />
      )
    })

    expect(host.textContent).toContain('LLM provider')
    expect(host.textContent).toContain('LLM model')
    expect(host.querySelector('#settings-api-key-google')).not.toBeNull()

    const selects = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')
    expect(selects).toHaveLength(2)
    expect(Array.from(selects[0].options).map((option) => option.textContent)).toEqual(['Google'])
    expect(Array.from(selects[1].options).map((option) => option.textContent)).toEqual(['gemini-2.5-flash'])
  })
})
