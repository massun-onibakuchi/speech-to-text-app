/*
Where: src/renderer/shortcut-capture.ts
What: Keyboard shortcut capture/normalization helpers for renderer shortcut editor.
Why: Keep capture-mode interaction deterministic and aligned with Electron accelerator parsing.
*/

const MODIFIER_SEGMENTS = ['Cmd', 'Ctrl', 'Opt', 'Shift'] as const
const CANONICAL_MODIFIER_ORDER = ['cmd', 'ctrl', 'opt', 'shift'] as const
const CODE_NON_MODIFIER_KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

// Preserve duplicate-detection stability for persisted symbol-form shortcuts.
// Capture now stores base keys, but this map prevents silent duplicate drift
// when older settings still contain Option-produced symbols.
const LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT: Record<string, string> = {
  'å': 'a',
  '∫': 'b',
  'ç': 'c',
  '∂': 'd',
  '€': 'e',
  'ƒ': 'f',
  '©': 'g',
  '˙': 'h',
  'ˆ': 'i',
  '∆': 'j',
  '˚': 'k',
  '¬': 'l',
  'µ': 'm',
  '˜': 'n',
  'ø': 'o',
  'π': 'p',
  'œ': 'q',
  '®': 'r',
  'ß': 's',
  '†': 't',
  '¨': 'u',
  '√': 'v',
  '∑': 'w',
  '≈': 'x',
  '¥': 'y',
  'ω': 'z',
  '¡': '1',
  '™': '2',
  '£': '3',
  '¢': '4',
  '∞': '5',
  '§': '6',
  '¶': '7',
  '•': '8',
  'ª': '9',
  'º': '0'
}

const NON_MODIFIER_KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

const isModifierKey = (key: string): boolean => {
  return key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift'
}

const normalizeMainKey = (key: string): string | null => {
  if (isModifierKey(key)) {
    return null
  }
  const mapped = NON_MODIFIER_KEY_LABELS[key]
  if (mapped) {
    return mapped
  }
  if (key.length === 1) {
    return key.toUpperCase()
  }
  return key.length > 0 ? `${key[0].toUpperCase()}${key.slice(1)}` : null
}

const normalizeMainKeyFromCode = (code: string | undefined): string | null => {
  if (!code) {
    return null
  }

  const letterMatch = /^Key([A-Z])$/.exec(code)
  if (letterMatch) {
    return letterMatch[1]
  }

  const digitMatch = /^Digit([0-9])$/.exec(code)
  if (digitMatch) {
    return digitMatch[1]
  }

  return CODE_NON_MODIFIER_KEY_LABELS[code] ?? null
}

export const hasModifierShortcut = (shortcut: string): boolean => {
  const segments = shortcut
    .split('+')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0)
  const isModifierSegment = (segment: string): boolean => {
    return (
      segment === 'cmd' ||
      segment === 'command' ||
      segment === 'meta' ||
      segment === 'ctrl' ||
      segment === 'control' ||
      segment === 'opt' ||
      segment === 'option' ||
      segment === 'alt' ||
      segment === 'shift'
    )
  }
  const hasModifier = segments.some((segment) => isModifierSegment(segment))
  const hasNonModifier = segments.some((segment) => !isModifierSegment(segment))
  return hasModifier && hasNonModifier
}

export const canonicalizeShortcutForDuplicateCheck = (shortcut: string): string => {
  const segments = shortcut
    .split('+')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0)

  const toCanonicalSegment = (segment: string): string => {
    if (segment === 'command' || segment === 'meta') return 'cmd'
    if (segment === 'control') return 'ctrl'
    if (segment === 'option' || segment === 'alt') return 'opt'
    return segment
  }

  const canonicalSegments = segments.map((segment) => toCanonicalSegment(segment))
  const modifiers = canonicalSegments
    .filter((segment): segment is (typeof CANONICAL_MODIFIER_ORDER)[number] => {
      return CANONICAL_MODIFIER_ORDER.includes(segment as (typeof CANONICAL_MODIFIER_ORDER)[number])
    })
    .sort((a, b) => CANONICAL_MODIFIER_ORDER.indexOf(a) - CANONICAL_MODIFIER_ORDER.indexOf(b))
  const nonModifiers = canonicalSegments
    .filter((segment) => !CANONICAL_MODIFIER_ORDER.includes(segment as (typeof CANONICAL_MODIFIER_ORDER)[number]))
    .map((segment) => LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT[segment] ?? segment)

  return [...modifiers, ...nonModifiers].join('+')
}

export const formatShortcutFromKeyboardEvent = (event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): { combo: string | null; error: string | null } => {
  // Alt/Option can mutate event.key into a produced character (for example π on Option+P).
  // Prefer keyboard-position code in that case so shortcut labels remain semantic.
  const mainKey = (event.altKey ? normalizeMainKeyFromCode(event.code) : null) ?? normalizeMainKey(event.key)
  if (!mainKey) {
    return {
      combo: null,
      error: 'Press a non-modifier key to complete the shortcut.'
    }
  }

  const modifiers: string[] = []
  if (event.metaKey) {
    modifiers.push(MODIFIER_SEGMENTS[0])
  }
  if (event.ctrlKey) {
    modifiers.push(MODIFIER_SEGMENTS[1])
  }
  if (event.altKey) {
    modifiers.push(MODIFIER_SEGMENTS[2])
  }
  if (event.shiftKey) {
    modifiers.push(MODIFIER_SEGMENTS[3])
  }

  if (modifiers.length === 0) {
    return {
      combo: null,
      error: 'Shortcut must include at least one modifier key (Cmd/Ctrl/Opt/Shift).'
    }
  }

  return {
    combo: [...modifiers, mainKey].join('+'),
    error: null
  }
}
