// Where: src/main/services/codex-cli-service.test.ts
// What:  Unit tests for Codex CLI install/login readiness normalization.
// Why:   Keep shell-command parsing isolated and stable as the provider-readiness contract changes.

import { describe, expect, it, vi } from 'vitest'
import { CodexCliService } from './codex-cli-service'

describe('CodexCliService', () => {
  it('reports cli_not_installed when codex is missing', async () => {
    const run = vi.fn(async () => {
      const err = new Error('spawn codex ENOENT') as Error & { code: string }
      err.code = 'ENOENT'
      throw err
    })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'cli_not_installed' })
  })

  it('reports cli_login_required when login status says the user is logged out', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex 0.28.0\n', stderr: '' })
      .mockRejectedValueOnce({ code: 1, stdout: '', stderr: 'Not logged in. Run codex login.\n' })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'cli_login_required' })
  })

  it('reports ready with version when login status confirms ChatGPT auth', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex 0.28.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Logged in using ChatGPT\n', stderr: '' })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'ready', version: '0.28.0' })
  })

  it('reports cli_probe_failed when login status output cannot be normalized', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex 0.28.0\n', stderr: '' })
      .mockRejectedValueOnce({ code: 9, stdout: '', stderr: 'Segmentation fault\n' })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({
      kind: 'cli_probe_failed',
      message: 'Segmentation fault'
    })
  })

  it('rethrows logout failures other than missing executable', async () => {
    const run = vi.fn(async () => {
      throw new Error('logout failed')
    })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.logout()).rejects.toThrow('logout failed')
  })

  it('ignores logout when codex is missing', async () => {
    const run = vi.fn(async () => {
      const err = new Error('spawn codex ENOENT') as Error & { code: string }
      err.code = 'ENOENT'
      throw err
    })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.logout()).resolves.toBeUndefined()
  })
})
