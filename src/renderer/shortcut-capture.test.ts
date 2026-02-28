// Where: src/renderer/shortcut-capture.test.ts
// What: Unit tests for keyboard shortcut capture normalization.
// Why: Lock capture-mode behavior for modifiers, key normalization, and validation messaging.

import { describe, expect, it } from 'vitest'
import { formatShortcutFromKeyboardEvent, hasModifierShortcut } from './shortcut-capture'

describe('formatShortcutFromKeyboardEvent', () => {
  it('formats captured key combos with normalized modifier segments', () => {
    expect(
      formatShortcutFromKeyboardEvent({
        key: '3',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toEqual({
      combo: 'Cmd+Opt+3',
      error: null
    })
  })

  it('rejects modifier-only captures', () => {
    expect(
      formatShortcutFromKeyboardEvent({
        key: 'Shift',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toEqual({
      combo: null,
      error: 'Press a non-modifier key to complete the shortcut.'
    })
  })

  it('requires at least one modifier for a valid capture', () => {
    expect(
      formatShortcutFromKeyboardEvent({
        key: 'k',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toEqual({
      combo: null,
      error: 'Shortcut must include at least one modifier key (Cmd/Ctrl/Opt/Shift).'
    })
  })
})

describe('hasModifierShortcut', () => {
  it('detects modifier segments in stored shortcut text', () => {
    expect(hasModifierShortcut('Cmd+Opt+K')).toBe(true)
    expect(hasModifierShortcut('Ctrl+Shift+9')).toBe(true)
    expect(hasModifierShortcut('K')).toBe(false)
    expect(hasModifierShortcut('Shift')).toBe(false)
  })
})
