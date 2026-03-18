import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_RUNTIME_MANIFEST, type LocalRuntimeInstallMetadata } from '../../shared/local-runtime'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/tmp/dicta-tests')
}))

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath
  }
}))

import { LocalRuntimeInstallManager, type LocalRuntimeCommandRunner } from './local-runtime-install-manager'

const createTempRoot = (): string => mkdtempSync(join(tmpdir(), 'dicta-local-runtime-'))

const createRecordingCommandRunner = () => {
  const calls: Array<{ command: string; args: string[] }> = []
  const runner: LocalRuntimeCommandRunner = {
    run: vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args })
      if (args[0] === '-c') {
        return { stdout: '3.11.9\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })
  }
  return { runner, calls }
}

describe('LocalRuntimeInstallManager', () => {
  let tempRoot = ''

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('starts as not installed by default', () => {
    tempRoot = createTempRoot()
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })

    expect(manager.getStatusSnapshot()).toMatchObject({
      state: 'not_installed',
      canRequestInstall: true,
      canUninstall: false,
      requiresUpdate: false
    })
  })

  it('installs the pinned runtime into the managed root after explicit confirmation', async () => {
    tempRoot = createTempRoot()
    const { runner, calls } = createRecordingCommandRunner()
    const statuses: string[] = []
    const manager = new LocalRuntimeInstallManager({
      runtimeBaseRoot: tempRoot,
      commandRunner: runner,
      onStatusChanged: (snapshot) => {
        statuses.push(snapshot.state)
      }
    })

    expect(manager.requestInstall().state).toBe('awaiting_user_confirmation')
    const installing = manager.confirmInstall()
    expect(installing.state).toBe('installing')

    await vi.waitFor(() => {
      expect(manager.getStatusSnapshot().state).toBe('ready')
    })

    expect(calls).toEqual([
      { command: 'python3', args: ['-c', expect.any(String)] },
      { command: 'python3', args: ['-m', 'venv', join(tempRoot, 'staging', 'venv')] },
      { command: join(tempRoot, 'staging', 'venv', 'bin', 'python'), args: ['-m', 'pip', 'install', '--upgrade', 'pip'] },
      {
        command: join(tempRoot, 'staging', 'venv', 'bin', 'python'),
        args: ['-m', 'pip', 'install', '--upgrade', LOCAL_RUNTIME_MANIFEST.packageSpec]
      }
    ])
    expect(statuses).toContain('awaiting_user_confirmation')
    expect(statuses).toContain('installing')
    expect(statuses.at(-1)).toBe('ready')

    const metadata = JSON.parse(
      readFileSync(join(tempRoot, 'current', 'install-metadata.json'), 'utf8')
    ) as LocalRuntimeInstallMetadata
    expect(metadata.version).toBe(LOCAL_RUNTIME_MANIFEST.version)
    expect(metadata.backend).toBe(LOCAL_RUNTIME_MANIFEST.backend)
  })

  it('cancels an in-progress install and leaves no committed runtime behind', async () => {
    tempRoot = createTempRoot()
    const runner: LocalRuntimeCommandRunner = {
      run: vi.fn(async (_command, args, options) => {
        if (args[0] === '-c') {
          return { stdout: '3.11.9\n', stderr: '' }
        }
        await new Promise<void>((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('Command aborted.')), { once: true })
        })
        return { stdout: '', stderr: '' }
      })
    }
    const manager = new LocalRuntimeInstallManager({
      runtimeBaseRoot: tempRoot,
      commandRunner: runner
    })

    manager.requestInstall()
    manager.confirmInstall()

    await vi.waitFor(() => {
      expect(manager.getStatusSnapshot().state).toBe('installing')
    })

    const cancelled = manager.cancelInstall()
    expect(cancelled.state).toBe('not_installed')
    expect(cancelled.summary).toContain('cancelled')

    await vi.waitFor(() => {
      expect(existsSync(join(tempRoot, 'current', 'install-metadata.json'))).toBe(false)
    })
  })

  it('reports update required when the installed metadata drifts from the pinned version', () => {
    tempRoot = createTempRoot()
    const metadataRoot = join(tempRoot, 'current')
    mkdirSync(metadataRoot, { recursive: true })
    writeFileSync(
      join(metadataRoot, 'install-metadata.json'),
      JSON.stringify({
        runtimeId: LOCAL_RUNTIME_MANIFEST.runtimeId,
        backend: LOCAL_RUNTIME_MANIFEST.backend,
        version: '0.0.1',
        installedAt: new Date().toISOString(),
        pythonExecutable: 'python3',
        pythonVersion: '3.11.9'
      }),
      'utf8'
    )

    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })

    expect(manager.getStatusSnapshot()).toMatchObject({
      state: 'not_installed',
      installedVersion: '0.0.1',
      requiresUpdate: true,
      canUninstall: true
    })
  })

  it('blocks uninstall while a local session is active', () => {
    tempRoot = createTempRoot()
    const metadataRoot = join(tempRoot, 'current')
    mkdirSync(metadataRoot, { recursive: true })
    writeFileSync(
      join(metadataRoot, 'install-metadata.json'),
      JSON.stringify({
        runtimeId: LOCAL_RUNTIME_MANIFEST.runtimeId,
        backend: LOCAL_RUNTIME_MANIFEST.backend,
        version: LOCAL_RUNTIME_MANIFEST.version,
        installedAt: new Date().toISOString(),
        pythonExecutable: 'python3',
        pythonVersion: '3.11.9'
      }),
      'utf8'
    )

    const manager = new LocalRuntimeInstallManager({
      runtimeBaseRoot: tempRoot,
      isLocalSessionActive: () => true
    })

    expect(() => manager.uninstallRuntime()).toThrow(/while a local streaming session is active/i)
  })

  it('restores the previous committed runtime when promotion from staging fails', async () => {
    tempRoot = createTempRoot()
    const currentRoot = join(tempRoot, 'current')
    mkdirSync(currentRoot, { recursive: true })
    writeFileSync(
      join(currentRoot, 'install-metadata.json'),
      JSON.stringify({
        runtimeId: LOCAL_RUNTIME_MANIFEST.runtimeId,
        backend: LOCAL_RUNTIME_MANIFEST.backend,
        version: LOCAL_RUNTIME_MANIFEST.version,
        installedAt: '2026-03-18T00:00:00.000Z',
        pythonExecutable: 'python3',
        pythonVersion: '3.11.9'
      }),
      'utf8'
    )

    const { runner } = createRecordingCommandRunner()
    let renameCallCount = 0
    const manager = new LocalRuntimeInstallManager({
      runtimeBaseRoot: tempRoot,
      commandRunner: runner,
      renamePath: (sourcePath, targetPath) => {
        renameCallCount += 1
        if (renameCallCount === 2) {
          throw new Error('promotion failed')
        }
        renameSync(sourcePath, targetPath)
      }
    })

    manager.requestInstall()
    manager.confirmInstall()

    await vi.waitFor(() => {
      expect(manager.getStatusSnapshot().state).toBe('failed')
    })

    const restoredMetadata = JSON.parse(
      readFileSync(join(tempRoot, 'current', 'install-metadata.json'), 'utf8')
    ) as LocalRuntimeInstallMetadata
    expect(restoredMetadata.installedAt).toBe('2026-03-18T00:00:00.000Z')
    expect(manager.getStatusSnapshot().detail).toContain('promotion failed')
  })
})
