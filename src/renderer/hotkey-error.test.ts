import { describe, expect, it, vi } from 'vitest'
import { applyHotkeyErrorNotification, toHotkeyErrorMessage } from './hotkey-error'

describe('toHotkeyErrorMessage', () => {
  it('formats user-facing hotkey error text', () => {
    expect(toHotkeyErrorMessage({ combo: 'Cmd+Opt+R', message: 'Global shortcut registration failed.' })).toBe(
      'Shortcut Cmd+Opt+R failed: Global shortcut registration failed.'
    )
  })
})

describe('applyHotkeyErrorNotification', () => {
  it('emits matching activity and toast errors', () => {
    const addActivity = vi.fn()
    const addToast = vi.fn()

    applyHotkeyErrorNotification(
      { combo: 'Cmd+Opt+R', message: 'No active renderer window is available to handle recording commands.' },
      addActivity,
      addToast
    )

    const expected = 'Shortcut Cmd+Opt+R failed: No active renderer window is available to handle recording commands.'
    expect(addActivity).toHaveBeenCalledWith(expected, 'error')
    expect(addToast).toHaveBeenCalledWith(expected, 'error')
  })
})
