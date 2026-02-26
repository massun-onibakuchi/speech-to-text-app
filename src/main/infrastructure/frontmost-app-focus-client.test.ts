/*
Where: src/main/infrastructure/frontmost-app-focus-client.test.ts
What: Unit tests for frontmost app focus snapshot/restore AppleScript wrapper.
Why: Keep profile picker focus-restore behavior deterministic at the command boundary.
*/

import { describe, expect, it, vi } from 'vitest'
import { FrontmostAppFocusClient } from './frontmost-app-focus-client'

describe('FrontmostAppFocusClient', () => {
  it('returns null on non-macOS without invoking osascript', async () => {
    const runCommand = vi.fn()
    const client = new FrontmostAppFocusClient({
      runCommand: runCommand as any,
      platform: 'linux'
    })

    await expect(client.captureFrontmostBundleId()).resolves.toBeNull()
    await expect(client.activateBundleId('com.google.Chrome')).resolves.toBeUndefined()
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('captures and trims the frontmost app bundle id on macOS', async () => {
    const runCommand = vi.fn(async () => ({ stdout: 'com.google.Chrome \n', stderr: '' }))
    const client = new FrontmostAppFocusClient({
      runCommand: runCommand as any,
      platform: 'darwin'
    })

    await expect(client.captureFrontmostBundleId()).resolves.toBe('com.google.Chrome')
    expect(runCommand).toHaveBeenCalledWith('osascript', [
      '-e',
      'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
    ])
  })

  it('returns null when macOS frontmost-app capture returns empty stdout', async () => {
    const runCommand = vi.fn(async () => ({ stdout: '   \n', stderr: '' }))
    const client = new FrontmostAppFocusClient({
      runCommand: runCommand as any,
      platform: 'darwin'
    })

    await expect(client.captureFrontmostBundleId()).resolves.toBeNull()
    expect(runCommand).toHaveBeenCalledOnce()
  })

  it('activates a macOS app by bundle id via osascript', async () => {
    const runCommand = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const client = new FrontmostAppFocusClient({
      runCommand: runCommand as any,
      platform: 'darwin'
    })

    await client.activateBundleId('com.google.Chrome')

    expect(runCommand).toHaveBeenCalledWith('osascript', [
      '-e',
      'tell application id "com.google.Chrome" to activate'
    ])
  })

  it('skips activation when the macOS bundle id is empty after trim', async () => {
    const runCommand = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const client = new FrontmostAppFocusClient({
      runCommand: runCommand as any,
      platform: 'darwin'
    })

    await expect(client.activateBundleId('   ')).resolves.toBeUndefined()
    expect(runCommand).not.toHaveBeenCalled()
  })
})
