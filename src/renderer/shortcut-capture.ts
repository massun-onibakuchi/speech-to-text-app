/*
Where: src/renderer/shortcut-capture.ts
What: Keyboard shortcut capture/normalization helpers for renderer shortcut editor.
Why: Keep capture-mode interaction deterministic and aligned with Electron accelerator parsing.
*/

const MODIFIER_SEGMENTS = ['Cmd', 'Ctrl', 'Opt', 'Shift'] as const
const CANONICAL_MODIFIER_ORDER = ['cmd', 'ctrl', 'opt', 'shift'] as const

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
  const nonModifiers = canonicalSegments.filter((segment) => !CANONICAL_MODIFIER_ORDER.includes(segment as (typeof CANONICAL_MODIFIER_ORDER)[number]))

  return [...modifiers, ...nonModifiers].join('+')
}

export const formatShortcutFromKeyboardEvent = (event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): { combo: string | null; error: string | null } => {
  const mainKey = normalizeMainKey(event.key)
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
