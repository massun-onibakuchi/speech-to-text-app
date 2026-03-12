// src/main/coordination/clipboard-state-policy.test.ts
// Verifies PermissiveClipboardPolicy contract: all operations always allowed.

import { describe, expect, it } from 'vitest'
import { PermissiveClipboardPolicy, StreamingPasteClipboardPolicy } from './clipboard-state-policy'

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

describe('StreamingPasteClipboardPolicy', () => {
  it('blocks clipboard reads even when no write is active', () => {
    const policy = new StreamingPasteClipboardPolicy()
    expect(policy.canRead()).toBe(false)
    expect(policy.canWrite()).toBe(true)
  })

  it('blocks writes only while a streaming write is in flight', () => {
    const policy = new StreamingPasteClipboardPolicy()

    policy.willWrite()
    expect(policy.canWrite()).toBe(false)

    policy.didWrite()
    expect(policy.canWrite()).toBe(true)
  })
})
