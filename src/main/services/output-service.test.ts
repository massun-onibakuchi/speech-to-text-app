import { describe, expect, it, vi } from 'vitest'
import { OutputService } from './output-service'

describe('OutputService', () => {
  it.each([
    { copyToClipboard: true, pasteAtCursor: false, expectedStatus: 'succeeded', writes: 1, pastes: 0 },
    { copyToClipboard: false, pasteAtCursor: true, expectedStatus: 'succeeded', writes: 1, pastes: 1 },
    { copyToClipboard: true, pasteAtCursor: true, expectedStatus: 'succeeded', writes: 1, pastes: 1 },
    { copyToClipboard: false, pasteAtCursor: false, expectedStatus: 'succeeded', writes: 0, pastes: 0 }
  ])(
    'applies output matrix copy=$copyToClipboard paste=$pasteAtCursor',
    async ({ copyToClipboard, pasteAtCursor, expectedStatus, writes, pastes }) => {
      const writeText = vi.fn()
      const pasteAtCursorSpy = vi.fn(async () => undefined)
      const service = new OutputService({
        clipboardClient: { writeText } as any,
        permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
        pasteAutomationClient: { pasteAtCursor: pasteAtCursorSpy } as any
      })

      const status = await service.applyOutput('hello', { copyToClipboard, pasteAtCursor })
      expect(status).toBe(expectedStatus)
      expect(writeText).toHaveBeenCalledTimes(writes)
      expect(pasteAtCursorSpy).toHaveBeenCalledTimes(pastes)
    }
  )

  it('returns partial failure when paste is enabled but accessibility is missing', async () => {
    const writeText = vi.fn()
    const pasteAtCursor = vi.fn()
    const service = new OutputService({
      clipboardClient: { writeText } as any,
      permissionService: {
        getAccessibilityPermissionStatus: () => ({ granted: false, guidance: 'Enable Accessibility in Settings.' })
      } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })

    const status = await service.applyOutput('hello', { copyToClipboard: true, pasteAtCursor: true })
    expect(status).toBe('output_failed_partial')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(pasteAtCursor).not.toHaveBeenCalled()
    expect(service.getLastOutputMessage()).toContain('Accessibility')
  })

  it('supports no-action mode when both toggles are disabled', async () => {
    const writeText = vi.fn()
    const pasteAtCursor = vi.fn()
    const service = new OutputService({
      clipboardClient: { writeText } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })

    const status = await service.applyOutput('hello', { copyToClipboard: false, pasteAtCursor: false })
    expect(status).toBe('succeeded')
    expect(writeText).not.toHaveBeenCalled()
    expect(pasteAtCursor).not.toHaveBeenCalled()
  })

  it('captures actionable message when paste automation throws', async () => {
    const pasteAtCursor = vi.fn(async () => {
      throw new Error('automation failed')
    })
    const service = new OutputService({
      clipboardClient: { writeText: vi.fn() } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })

    const status = await service.applyOutput('hello', { copyToClipboard: true, pasteAtCursor: true })
    expect(status).toBe('output_failed_partial')
    expect(pasteAtCursor).toHaveBeenCalledTimes(2)
    expect(service.getLastOutputMessage()).toContain('Paste automation failed after 2 attempts')
    expect(service.getLastOutputMessage()).toContain('automation failed')
  })

  it('returns status and message atomically for paste failures', async () => {
    const service = new OutputService({
      clipboardClient: { writeText: vi.fn() } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: {
        pasteAtCursor: vi.fn(async () => {
          throw new Error('automation failed')
        })
      } as any
    })

    const result = await service.applyOutputWithDetail('hello', { copyToClipboard: true, pasteAtCursor: true })
    expect(result.status).toBe('output_failed_partial')
    expect(result.message).toContain('Paste automation failed after 2 attempts')
    expect(result.message).toContain('automation failed')
  })

  it('does not report partial failure for transient first-attempt paste error', async () => {
    const pasteAtCursor = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient first attempt failure'))
      .mockResolvedValueOnce(undefined)
    const writeText = vi.fn()
    const service = new OutputService({
      clipboardClient: { writeText } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })

    const status = await service.applyOutput('hello', { copyToClipboard: false, pasteAtCursor: true })
    expect(status).toBe('succeeded')
    expect(pasteAtCursor).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(service.getLastOutputMessage()).toBeNull()
  })

  it('recovers from transient first-attempt paste error when copy and paste are both enabled', async () => {
    const pasteAtCursor = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient paste failure'))
      .mockResolvedValueOnce(undefined)
    const writeText = vi.fn()
    const service = new OutputService({
      clipboardClient: { writeText } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })

    const status = await service.applyOutput('hello', { copyToClipboard: true, pasteAtCursor: true })
    expect(status).toBe('succeeded')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(pasteAtCursor).toHaveBeenCalledTimes(2)
    expect(service.getLastOutputMessage()).toBeNull()
  })

  it('waits briefly between retry attempts', async () => {
    const pasteAtCursor = vi
      .fn()
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValueOnce(undefined)
    const waitFn = vi.fn(async () => undefined)
    const service = new OutputService({
      clipboardClient: { writeText: vi.fn() } as any,
      permissionService: { getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null }) } as any,
      pasteAutomationClient: { pasteAtCursor } as any,
      waitFn
    })

    const status = await service.applyOutput('hello', { copyToClipboard: false, pasteAtCursor: true })
    expect(status).toBe('succeeded')
    expect(waitFn).toHaveBeenCalledTimes(1)
    expect(waitFn).toHaveBeenCalledWith(150)
  })
})
