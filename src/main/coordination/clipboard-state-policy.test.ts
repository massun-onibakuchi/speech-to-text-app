// src/main/coordination/clipboard-state-policy.test.ts
// Verifies PermissiveClipboardPolicy contract: all operations always allowed.

import { describe, expect, it } from 'vitest'
import { PermissiveClipboardPolicy } from './clipboard-state-policy'

describe('PermissiveClipboardPolicy', () => {
  it('always allows read and write', () => {
    const policy = new PermissiveClipboardPolicy()
    expect(policy.canRead()).toBe(true)
    expect(policy.canWrite()).toBe(true)
  })

  it('lifecycle methods do not throw', () => {
    const policy = new PermissiveClipboardPolicy()
    expect(() => policy.willWrite()).not.toThrow()
    expect(() => policy.didWrite()).not.toThrow()
  })

  it('remains permissive after lifecycle calls', () => {
    const policy = new PermissiveClipboardPolicy()
    policy.willWrite()
    policy.didWrite()
    expect(policy.canRead()).toBe(true)
    expect(policy.canWrite()).toBe(true)
  })
})
