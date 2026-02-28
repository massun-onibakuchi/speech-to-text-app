// Where: src/renderer/shortcut-capture.test.ts
// What: Unit tests for keyboard shortcut capture normalization.
// Why: Lock capture-mode behavior for modifiers, key normalization, and validation messaging.

import { describe, expect, it } from 'vitest'
import { canonicalizeShortcutForDuplicateCheck, formatShortcutFromKeyboardEvent, hasModifierShortcut } from './shortcut-capture'

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

  it('uses keyboard code for Option-modified letter keys to avoid symbol substitution', () => {
    expect(
      formatShortcutFromKeyboardEvent({
        key: 'π',
        code: 'KeyP',
        metaKey: false,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toEqual({
      combo: 'Opt+P',
      error: null
    })
  })

  it('uses keyboard code for Option-modified digit keys to avoid symbol substitution', () => {
    expect(
      formatShortcutFromKeyboardEvent({
        key: '¡',
        code: 'Digit1',
        metaKey: false,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toEqual({
      combo: 'Opt+1',
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

describe('canonicalizeShortcutForDuplicateCheck', () => {
  it('normalizes legacy option-symbol shortcut segments to base keys', () => {
    expect(canonicalizeShortcutForDuplicateCheck('Opt+π')).toBe('opt+p')
    expect(canonicalizeShortcutForDuplicateCheck('Option+¡')).toBe('opt+1')
    expect(canonicalizeShortcutForDuplicateCheck('Opt+Ω')).toBe('opt+z')
  })
})
