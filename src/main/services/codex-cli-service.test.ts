// Where: src/main/services/codex-cli-service.test.ts
// What:  Unit tests for Codex CLI install/login normalization and bounded execution.
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
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.128.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Logged in using ChatGPT\n', stderr: '' })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'ready', version: '0.128.0' })
  })

  it('uses successful login-status exit code even when CLI output has no known wording', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.145.0\n', stderr: 'WARNING: using existing config\n' })
      .mockResolvedValueOnce({ stdout: '', stderr: 'status check complete\n' })
    const service = new CodexCliService({ runCommand: run })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'ready', version: '0.145.0' })
  })

  it('finds Codex CLI from a fallback install path when GUI PATH cannot resolve codex', async () => {
    const missing = new Error('spawn codex ENOENT') as Error & { code: string }
    missing.code = 'ENOENT'
    const run = vi
      .fn()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.128.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Logged in using ChatGPT\n', stderr: '' })
    const service = new CodexCliService({
      runCommand: run,
      codexExecutableCandidates: ['codex', '/opt/homebrew/bin/codex']
    })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'ready', version: '0.128.0' })
    expect(run).toHaveBeenNthCalledWith(1, 'codex', ['--version'])
    expect(run).toHaveBeenNthCalledWith(2, '/opt/homebrew/bin/codex', ['--version'])
    expect(run).toHaveBeenNthCalledWith(3, '/opt/homebrew/bin/codex', ['login', 'status'])
  })

  it('finds Codex CLI through the user login shell for version-manager installs', async () => {
    const missing = new Error('spawn codex ENOENT') as Error & { code: string }
    missing.code = 'ENOENT'
    const shellResolvedCodex = '/Users/test/.nvm/versions/node/v22.10.0/bin/codex'
    const run = vi
      .fn()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ stdout: `${shellResolvedCodex}\n`, stderr: '' })
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.128.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Logged in using ChatGPT\n', stderr: '' })
    const service = new CodexCliService({
      runCommand: run,
      codexExecutableCandidates: ['codex'],
      shellExecutableCandidates: ['/bin/zsh'],
      codexFallbackExecutableCandidates: []
    })

    await expect(service.getReadiness()).resolves.toEqual({ kind: 'ready', version: '0.128.0' })
    expect(run).toHaveBeenNthCalledWith(1, 'codex', ['--version'])
    expect(run).toHaveBeenNthCalledWith(2, '/bin/zsh', ['-ilc', 'command -v codex'])
    expect(run).toHaveBeenNthCalledWith(3, shellResolvedCodex, ['--version'])
    expect(run).toHaveBeenNthCalledWith(4, shellResolvedCodex, ['login', 'status'])
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

  it('logs out through the resolved Codex CLI fallback path', async () => {
    const missing = new Error('spawn codex ENOENT') as Error & { code: string }
    missing.code = 'ENOENT'
    const run = vi
      .fn()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.128.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
    const service = new CodexCliService({
      runCommand: run,
      codexExecutableCandidates: ['codex', '/usr/local/share/npm-global/bin/codex']
    })

    await expect(service.logout()).resolves.toBeUndefined()
    expect(run).toHaveBeenNthCalledWith(3, '/usr/local/share/npm-global/bin/codex', ['logout'])
  })

  it('runs bounded Codex CLI transformation execution and returns the last message text', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const createTempDir = vi.fn(async () => '/tmp/dicta-codex-test')
    const readTextFile = vi.fn(async () => 'transformed output')
    const removeDir = vi.fn(async () => undefined)
    const service = new CodexCliService({
      runCommand: run,
      tempFiles: { createTempDir, readTextFile, removeDir }
    })

    await expect(
      service.runTransformation({
        model: 'gpt-5.4-mini',
        prompt: 'Rewrite this text.'
      })
    ).resolves.toBe('transformed output')

    expect(run).toHaveBeenNthCalledWith(1, 'codex', ['--version'])
    expect(run).toHaveBeenNthCalledWith(
      2,
      'codex',
      [
        'exec',
        '-m',
        'gpt-5.4-mini',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        '/tmp/dicta-codex-test/last-message.txt',
        '-'
      ],
      { input: 'Rewrite this text.' }
    )
    expect(createTempDir).toHaveBeenCalled()
    expect(readTextFile).toHaveBeenCalledWith('/tmp/dicta-codex-test/last-message.txt')
    expect(removeDir).toHaveBeenCalledWith('/tmp/dicta-codex-test')
  })

  it('surfaces Codex execution failures as normalized adapter-facing errors', async () => {
    const run = vi.fn().mockRejectedValue({ stderr: 'Authentication failed\n', stdout: '', code: 1 })
    const createTempDir = vi.fn(async () => '/tmp/dicta-codex-test')
    const removeDir = vi.fn(async () => undefined)
    const service = new CodexCliService({
      runCommand: run,
      tempFiles: { createTempDir, removeDir }
    })

    await expect(
      service.runTransformation({
        model: 'gpt-5.4-mini',
        prompt: 'Rewrite this text.'
      })
    ).rejects.toThrow('Codex CLI transformation failed: Authentication failed')

    expect(removeDir).toHaveBeenCalledWith('/tmp/dicta-codex-test')
  })

  it('treats empty Codex transformation output as malformed output', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const createTempDir = vi.fn(async () => '/tmp/dicta-codex-test')
    const readTextFile = vi.fn(async () => '   \n')
    const removeDir = vi.fn(async () => undefined)
    const service = new CodexCliService({
      runCommand: run,
      tempFiles: { createTempDir, readTextFile, removeDir }
    })

    await expect(
      service.runTransformation({
        model: 'gpt-5.4-mini',
        prompt: 'Rewrite this text.'
      })
    ).rejects.toThrow('Codex CLI returned empty transformation text.')

    expect(removeDir).toHaveBeenCalledWith('/tmp/dicta-codex-test')
  })
})
