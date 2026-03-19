// Where: Main process service layer.
// What: Owns consent, installation, update, uninstall, and persisted status for the optional local runtime.
// Why: The base app does not bundle WhisperLiveKit, so the app needs one place that manages the
//      pinned runtime lifecycle safely inside app-owned writable storage before later tickets start sessions.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import {
  LOCAL_RUNTIME_FAILURE_CODES,
  LOCAL_RUNTIME_MANIFEST,
  type LocalRuntimeFailureCode,
  type LocalRuntimeInstallMetadata,
  type LocalRuntimeInstallPhase,
  type LocalRuntimeManifest,
  type LocalRuntimeStatusSnapshot
} from '../../shared/local-runtime'

const PYTHON_VERSION_PROBE = [
  'import sys',
  "print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
].join('; ')

export interface LocalRuntimeCommandRunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}

export interface LocalRuntimeCommandRunner {
  run(command: string, args: string[], options?: LocalRuntimeCommandRunOptions): Promise<{ stdout: string; stderr: string }>
}

export interface LocalRuntimeInstallManagerOptions {
  runtimeBaseRoot?: string
  manifest?: LocalRuntimeManifest
  commandRunner?: LocalRuntimeCommandRunner
  pythonCandidates?: readonly string[]
  renamePath?: (sourcePath: string, targetPath: string) => void
  isLocalSessionActive?: () => boolean
  onStatusChanged?: (snapshot: LocalRuntimeStatusSnapshot) => void
}

type ActiveInstall = {
  controller: AbortController
  runId: number
}

const DEFAULT_PYTHON_CANDIDATES = ['python3', '/usr/bin/python3'] as const

class SpawnCommandRunner implements LocalRuntimeCommandRunner {
  async run(command: string, args: string[], options?: LocalRuntimeCommandRunOptions): Promise<{ stdout: string; stderr: string }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let finished = false

      const cleanupAbort = (): void => {
        options?.signal?.removeEventListener('abort', onAbort)
      }

      const onAbort = (): void => {
        if (finished) {
          return
        }
        child.kill('SIGTERM')
        reject(new Error('Command aborted.'))
      }

      options?.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        if (finished) {
          return
        }
        finished = true
        cleanupAbort()
        reject(error)
      })
      child.on('close', (code) => {
        if (finished) {
          return
        }
        finished = true
        cleanupAbort()
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }
        reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`))
      })
    })
  }
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('abort')

const parsePythonVersionParts = (version: string): [number, number, number] | null => {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const isSupportedPythonVersion = (version: string): boolean => {
  const parts = parsePythonVersionParts(version)
  if (!parts) {
    return false
  }
  const [major, minor] = parts
  return major === 3 && minor >= 11 && minor < 14
}

const cloneSnapshot = (snapshot: LocalRuntimeStatusSnapshot): LocalRuntimeStatusSnapshot =>
  structuredClone(snapshot)

export class LocalRuntimeInstallManager {
  private readonly runtimeBaseRoot: string
  private readonly manifest: LocalRuntimeManifest
  private readonly commandRunner: LocalRuntimeCommandRunner
  private readonly pythonCandidates: readonly string[]
  private readonly renamePath: (sourcePath: string, targetPath: string) => void
  private readonly isLocalSessionActive: () => boolean
  private readonly onStatusChanged?: (snapshot: LocalRuntimeStatusSnapshot) => void
  private activeInstall: ActiveInstall | null = null
  private statusSnapshot: LocalRuntimeStatusSnapshot
  private installRunCounter = 0

  constructor(options?: LocalRuntimeInstallManagerOptions) {
    this.runtimeBaseRoot = options?.runtimeBaseRoot ?? join(app.getPath('userData'), 'local-runtime', 'whisperlivekit')
    this.manifest = options?.manifest ?? LOCAL_RUNTIME_MANIFEST
    this.commandRunner = options?.commandRunner ?? new SpawnCommandRunner()
    this.pythonCandidates = options?.pythonCandidates ?? DEFAULT_PYTHON_CANDIDATES
    this.renamePath = options?.renamePath ?? renameSync
    this.isLocalSessionActive = options?.isLocalSessionActive ?? (() => false)
    this.onStatusChanged = options?.onStatusChanged
    this.statusSnapshot = this.discoverInstalledSnapshot()
  }

  getStatusSnapshot(): LocalRuntimeStatusSnapshot {
    return cloneSnapshot(this.statusSnapshot)
  }

  requestInstall(): LocalRuntimeStatusSnapshot {
    this.assertNoActiveSession('request installation changes')
    if (this.statusSnapshot.state === 'installing' || this.statusSnapshot.state === 'awaiting_user_confirmation') {
      return this.getStatusSnapshot()
    }

    const installedVersion = this.readInstalledMetadata()?.version ?? null
    return this.publish({
      state: 'awaiting_user_confirmation',
      manifest: this.manifest,
      runtimeRoot: this.getRuntimeRoot(),
      installedVersion,
      installedAt: this.readInstalledMetadata()?.installedAt ?? null,
      summary: installedVersion ? 'Approve runtime reinstall' : 'Approve local runtime install',
      detail: installedVersion
        ? `Dicta will update WhisperLiveKit to ${this.manifest.version} with ${this.manifest.backend}.`
        : `Dicta will install WhisperLiveKit ${this.manifest.version} with ${this.manifest.backend}.`,
      phase: null,
      failureCode: null,
      canRequestInstall: false,
      canCancel: true,
      canUninstall: installedVersion !== null,
      requiresUpdate: installedVersion !== null && installedVersion !== this.manifest.version
    })
  }

  declineInstall(): LocalRuntimeStatusSnapshot {
    if (this.statusSnapshot.state !== 'awaiting_user_confirmation') {
      return this.getStatusSnapshot()
    }
    return this.publish(this.discoverInstalledSnapshot())
  }

  confirmInstall(): LocalRuntimeStatusSnapshot {
    this.assertNoActiveSession('install or update the local runtime')
    if (this.statusSnapshot.state !== 'awaiting_user_confirmation') {
      throw new Error('Runtime install confirmation was not requested.')
    }
    if (this.activeInstall !== null) {
      return this.getStatusSnapshot()
    }

    const runId = ++this.installRunCounter
    const controller = new AbortController()
    this.activeInstall = { controller, runId }
    const installing = this.publish({
      state: 'installing',
      manifest: this.manifest,
      runtimeRoot: this.getRuntimeRoot(),
      installedVersion: this.readInstalledMetadata()?.version ?? null,
      installedAt: this.readInstalledMetadata()?.installedAt ?? null,
      summary: 'Installing local runtime',
      detail: 'Bootstrapping the managed environment.',
      phase: 'bootstrap',
      failureCode: null,
      canRequestInstall: false,
      canCancel: true,
      canUninstall: false,
      requiresUpdate: false
    })

    void this.runInstall(runId, controller.signal)
    return installing
  }

  cancelInstall(): LocalRuntimeStatusSnapshot {
    if (this.statusSnapshot.state === 'awaiting_user_confirmation') {
      return this.publish(this.discoverInstalledSnapshot())
    }
    if (this.statusSnapshot.state !== 'installing' || this.activeInstall === null) {
      return this.getStatusSnapshot()
    }

    this.activeInstall.controller.abort()
    this.activeInstall = null
    this.removeStagingRoot()
    return this.publish(this.discoverInstalledSnapshot('Local runtime install cancelled.', 'No runtime changes were committed.'))
  }

  uninstallRuntime(): LocalRuntimeStatusSnapshot {
    this.assertNoActiveSession('uninstall the local runtime')
    if (this.statusSnapshot.state === 'installing') {
      throw new Error('Cannot uninstall while the local runtime install is in progress.')
    }

    rmSync(this.getRuntimeRoot(), { recursive: true, force: true })
    rmSync(this.getStagingRoot(), { recursive: true, force: true })
    return this.publish(this.discoverInstalledSnapshot('Local runtime removed.', 'The managed WhisperLiveKit runtime was removed from app storage.'))
  }

  private async runInstall(runId: number, signal: AbortSignal): Promise<void> {
    try {
      const python = await this.resolvePythonExecutable(signal)
      if (!this.isInstallRunActive(runId)) {
        return
      }

      this.publishInstallingPhase('packages', `Using Python ${python.version}. Upgrading pip in the managed environment.`)
      await this.bootstrapEnvironment(python.executable, signal)
      if (!this.isInstallRunActive(runId)) {
        return
      }

      this.publishInstallingPhase('backend', `Installing ${this.manifest.packageSpec}.`)
      await this.installRuntimePackage(signal)
      if (!this.isInstallRunActive(runId)) {
        return
      }

      const metadata: LocalRuntimeInstallMetadata = {
        runtimeId: this.manifest.runtimeId,
        backend: this.manifest.backend,
        version: this.manifest.version,
        installedAt: new Date().toISOString(),
        pythonExecutable: python.executable,
        pythonVersion: python.version
      }
      this.writeJsonAtomic(this.getStagingMetadataPath(), metadata)
      this.commitStagingRoot()

      if (!this.isInstallRunActive(runId)) {
        return
      }
      this.publish(this.discoverInstalledSnapshot('Local runtime installed.', `WhisperLiveKit ${this.manifest.version} is ready for local streaming.`))
    } catch (error) {
      if (!this.isInstallRunActive(runId)) {
        return
      }
      const failure = this.buildFailureSnapshot(error)
      this.removeStagingRoot()
      this.publish(failure)
    } finally {
      if (this.activeInstall?.runId === runId) {
        this.activeInstall = null
      }
    }
  }

  private async resolvePythonExecutable(signal: AbortSignal): Promise<{ executable: string; version: string }> {
    let lastError: Error | null = null

    for (const candidate of this.pythonCandidates) {
      try {
        const { stdout } = await this.commandRunner.run(candidate, ['-c', PYTHON_VERSION_PROBE], { signal })
        const version = stdout.trim()
        if (!isSupportedPythonVersion(version)) {
          throw new Error(`Unsupported Python version ${version}. Expected ${this.manifest.pythonVersionRange}.`)
        }
        return { executable: candidate, version }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    if (lastError && lastError.message.includes('Unsupported Python version')) {
      throw new LocalRuntimeInstallError(
        'python_unsupported',
        `Python ${this.manifest.pythonVersionRange} is required to install the local runtime.`
      )
    }
    throw new LocalRuntimeInstallError(
      'python_missing',
      'Python 3.11 through 3.13 was not found. Install Python 3.11+ and try again.'
    )
  }

  private async bootstrapEnvironment(pythonExecutable: string, signal: AbortSignal): Promise<void> {
    const stagingRoot = this.getStagingRoot()
    rmSync(stagingRoot, { recursive: true, force: true })
    mkdirSync(stagingRoot, { recursive: true })

    try {
      await this.commandRunner.run(pythonExecutable, ['-m', 'venv', this.getStagingVenvRoot()], { signal })
      await this.commandRunner.run(this.getStagingPythonExecutable(), ['-m', 'pip', 'install', '--upgrade', 'pip'], {
        signal,
        env: {
          ...process.env,
          PIP_DISABLE_PIP_VERSION_CHECK: '1'
        }
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      throw new LocalRuntimeInstallError(
        'bootstrap_failed',
        error instanceof Error ? error.message : 'Managed Python environment bootstrap failed.'
      )
    }
  }

  private async installRuntimePackage(signal: AbortSignal): Promise<void> {
    try {
      await this.commandRunner.run(
        this.getStagingPythonExecutable(),
        ['-m', 'pip', 'install', '--upgrade', this.manifest.packageSpec],
        {
          signal,
          env: {
            ...process.env,
            PIP_DISABLE_PIP_VERSION_CHECK: '1'
          }
        }
      )
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      throw new LocalRuntimeInstallError(
        'backend_install_failed',
        error instanceof Error ? error.message : 'Runtime package installation failed.'
      )
    }
  }

  private buildFailureSnapshot(error: unknown): LocalRuntimeStatusSnapshot {
    if (isAbortError(error)) {
      return this.discoverInstalledSnapshot('Local runtime install cancelled.', 'No runtime changes were committed.')
    }

    const installed = this.readInstalledMetadata()
    const installError = error instanceof LocalRuntimeInstallError
      ? error
      : new LocalRuntimeInstallError('package_install_failed', error instanceof Error ? error.message : 'Unknown install failure.')

    return {
      state: 'failed',
      manifest: this.manifest,
      runtimeRoot: this.getRuntimeRoot(),
      installedVersion: installed?.version ?? null,
      installedAt: installed?.installedAt ?? null,
      summary: 'Local runtime install failed',
      detail: installError.message,
      phase: this.mapFailureCodeToPhase(installError.failureCode),
      failureCode: installError.failureCode,
      canRequestInstall: true,
      canCancel: false,
      canUninstall: installed !== null,
      requiresUpdate: installed !== null && installed.version !== this.manifest.version
    }
  }

  private mapFailureCodeToPhase(failureCode: LocalRuntimeFailureCode): LocalRuntimeInstallPhase | null {
    switch (failureCode) {
      case 'python_missing':
      case 'python_unsupported':
      case 'bootstrap_failed':
        return 'bootstrap'
      case 'package_install_failed':
        return 'packages'
      case 'backend_install_failed':
        return 'backend'
      default:
        return null
    }
  }

  private publishInstallingPhase(phase: LocalRuntimeInstallPhase, detail: string): void {
    this.publish({
      ...this.statusSnapshot,
      state: 'installing',
      summary: 'Installing local runtime',
      phase,
      detail,
      canRequestInstall: false,
      canCancel: true,
      canUninstall: false,
      failureCode: null
    })
  }

  private publish(snapshot: LocalRuntimeStatusSnapshot): LocalRuntimeStatusSnapshot {
    this.statusSnapshot = cloneSnapshot(snapshot)
    this.onStatusChanged?.(cloneSnapshot(snapshot))
    return this.getStatusSnapshot()
  }

  private discoverInstalledSnapshot(summaryOverride?: string, detailOverride?: string): LocalRuntimeStatusSnapshot {
    const installed = this.readInstalledMetadata()
    if (!installed) {
      return {
        state: 'not_installed',
        manifest: this.manifest,
        runtimeRoot: this.getRuntimeRoot(),
        installedVersion: null,
        installedAt: null,
        summary: summaryOverride ?? 'Local runtime not installed',
        detail: detailOverride ?? 'Install WhisperLiveKit on demand to enable local streaming.',
        phase: null,
        failureCode: null,
        canRequestInstall: true,
        canCancel: false,
        canUninstall: false,
        requiresUpdate: false
      }
    }

    if (installed.version !== this.manifest.version) {
      return {
        state: 'not_installed',
        manifest: this.manifest,
        runtimeRoot: this.getRuntimeRoot(),
        installedVersion: installed.version,
        installedAt: installed.installedAt,
        summary: summaryOverride ?? 'Local runtime update required',
        detail: detailOverride ?? `Installed version ${installed.version} does not match required version ${this.manifest.version}.`,
        phase: null,
        failureCode: null,
        canRequestInstall: true,
        canCancel: false,
        canUninstall: true,
        requiresUpdate: true
      }
    }

    return {
      state: 'ready',
      manifest: this.manifest,
      runtimeRoot: this.getRuntimeRoot(),
      installedVersion: installed.version,
      installedAt: installed.installedAt,
      summary: summaryOverride ?? 'Local runtime ready',
      detail: detailOverride ?? `WhisperLiveKit ${installed.version} with ${installed.backend} is installed.`,
      phase: null,
      failureCode: null,
      canRequestInstall: true,
      canCancel: false,
      canUninstall: true,
      requiresUpdate: false
    }
  }

  private readInstalledMetadata(): LocalRuntimeInstallMetadata | null {
    const metadataPath = this.getInstalledMetadataPath()
    if (!existsSync(metadataPath)) {
      return null
    }

    try {
      const parsed = JSON.parse(readFileSync(metadataPath, 'utf8')) as LocalRuntimeInstallMetadata
      if (
        parsed.runtimeId !== this.manifest.runtimeId ||
        parsed.backend !== this.manifest.backend ||
        typeof parsed.version !== 'string' ||
        typeof parsed.installedAt !== 'string' ||
        typeof parsed.pythonExecutable !== 'string' ||
        typeof parsed.pythonVersion !== 'string'
      ) {
        throw new Error('Invalid runtime metadata.')
      }
      return parsed
    } catch {
      return null
    }
  }

  private commitStagingRoot(): void {
    const runtimeRoot = this.getRuntimeRoot()
    const backupRoot = `${runtimeRoot}.bak`
    rmSync(backupRoot, { recursive: true, force: true })
    let movedCurrentToBackup = false
    if (existsSync(runtimeRoot)) {
      this.renamePath(runtimeRoot, backupRoot)
      movedCurrentToBackup = true
    }
    try {
      this.renamePath(this.getStagingRoot(), runtimeRoot)
      rmSync(backupRoot, { recursive: true, force: true })
    } catch (error) {
      if (movedCurrentToBackup && !existsSync(runtimeRoot) && existsSync(backupRoot)) {
        this.renamePath(backupRoot, runtimeRoot)
      }
      throw error
    }
  }

  private removeStagingRoot(): void {
    rmSync(this.getStagingRoot(), { recursive: true, force: true })
  }

  private writeJsonAtomic(targetPath: string, payload: unknown): void {
    const dirPath = dirname(targetPath)
    mkdirSync(dirPath, { recursive: true })
    const tempPath = `${targetPath}.${process.pid}.tmp`
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8')

    const tempFd = openSync(tempPath, 'r')
    try {
      fsyncSync(tempFd)
    } finally {
      closeSync(tempFd)
    }

    renameSync(tempPath, targetPath)

    const dirFd = openSync(dirPath, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  }

  private assertNoActiveSession(action: string): void {
    if (!this.isLocalSessionActive()) {
      return
    }
    throw new Error(`Cannot ${action} while a local streaming session is active.`)
  }

  private isInstallRunActive(runId: number): boolean {
    return this.activeInstall?.runId === runId
  }

  private getRuntimeRoot(): string {
    return join(this.runtimeBaseRoot, 'current')
  }

  private getStagingRoot(): string {
    return join(this.runtimeBaseRoot, 'staging')
  }

  private getInstalledMetadataPath(): string {
    return join(this.getRuntimeRoot(), 'install-metadata.json')
  }

  private getStagingMetadataPath(): string {
    return join(this.getStagingRoot(), 'install-metadata.json')
  }

  private getStagingVenvRoot(): string {
    return join(this.getStagingRoot(), 'venv')
  }

  private getStagingPythonExecutable(): string {
    return join(this.getStagingVenvRoot(), 'bin', 'python')
  }
}

class LocalRuntimeInstallError extends Error {
  readonly failureCode: LocalRuntimeFailureCode

  constructor(failureCode: LocalRuntimeFailureCode, message: string) {
    super(message)
    this.name = 'LocalRuntimeInstallError'
    this.failureCode = LOCAL_RUNTIME_FAILURE_CODES.includes(failureCode) ? failureCode : 'unexpected_state'
  }
}
