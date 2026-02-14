import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isTrustedAccessibilityClient } = vi.hoisted(() => ({
  isTrustedAccessibilityClient: vi.fn()
}))

vi.mock('electron', () => ({
  systemPreferences: {
    isTrustedAccessibilityClient
  }
}))

import { PermissionService } from './permission-service'

const originalPlatform = process.platform

const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true
  })
}

describe('PermissionService', () => {
  beforeEach(() => {
    isTrustedAccessibilityClient.mockReset()
    setPlatform(originalPlatform)
  })

  it('returns guidance when accessibility permission is missing on macOS', () => {
    setPlatform('darwin')
    isTrustedAccessibilityClient.mockReturnValue(false)

    const service = new PermissionService()
    const status = service.getAccessibilityPermissionStatus()

    expect(status.granted).toBe(false)
    expect(status.guidance).toContain('Accessibility')
  })

  it('returns granted when accessibility permission is present on macOS', () => {
    setPlatform('darwin')
    isTrustedAccessibilityClient.mockReturnValue(true)

    const service = new PermissionService()
    const status = service.getAccessibilityPermissionStatus()

    expect(status).toEqual({ granted: true, guidance: null })
  })
})
