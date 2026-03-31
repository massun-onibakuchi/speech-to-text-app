/**
 * Where: src/main/services/temporary-popup-shortcut-manager.test.ts
 * What:  Unit tests for shared temporary popup shortcut ownership handoff.
 * Why:   Scratch space and picker popups can overlap, so global Escape/navigation
 *        accelerators must restore correctly when the top popup closes.
 */

import { describe, expect, it, vi } from 'vitest'
import { TemporaryPopupShortcutManager } from './temporary-popup-shortcut-manager'

describe('TemporaryPopupShortcutManager', () => {
  it('gives active accelerators to the most recently acquired popup owner', () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((accelerator: string, callback: () => void) => {
      callbacksByAccelerator.set(accelerator, callback)
      return true
    })
    const unregister = vi.fn((accelerator: string) => {
      callbacksByAccelerator.delete(accelerator)
    })
    const manager = new TemporaryPopupShortcutManager({
      globalShortcut: { register, unregister }
    })
    const scratchEscape = vi.fn()
    const pickerEscape = vi.fn()

    manager.acquire('scratch', { Escape: scratchEscape })
    callbacksByAccelerator.get('Escape')?.()
    expect(scratchEscape).toHaveBeenCalledTimes(1)

    manager.acquire('picker', { Escape: pickerEscape, Enter: vi.fn() })
    callbacksByAccelerator.get('Escape')?.()
    expect(pickerEscape).toHaveBeenCalledTimes(1)
    expect(scratchEscape).toHaveBeenCalledTimes(1)
  })

  it('restores the previous popup owner shortcuts when the top owner releases', () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((accelerator: string, callback: () => void) => {
      callbacksByAccelerator.set(accelerator, callback)
      return true
    })
    const unregister = vi.fn((accelerator: string) => {
      callbacksByAccelerator.delete(accelerator)
    })
    const manager = new TemporaryPopupShortcutManager({
      globalShortcut: { register, unregister }
    })
    const scratchEscape = vi.fn()
    const pickerEscape = vi.fn()

    manager.acquire('scratch', { Escape: scratchEscape })
    manager.acquire('picker', { Escape: pickerEscape, Enter: vi.fn() })
    manager.release('picker')

    callbacksByAccelerator.get('Escape')?.()

    expect(scratchEscape).toHaveBeenCalledTimes(1)
    expect(pickerEscape).not.toHaveBeenCalled()
  })
})
