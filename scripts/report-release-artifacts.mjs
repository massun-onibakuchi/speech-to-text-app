#!/usr/bin/env node
/*
 * Where: scripts/report-release-artifacts.mjs
 * What: Report macOS release artifact sizes and discovered app binary metadata.
 * Why: Give release runs a stable, scriptable summary of produced artifacts so
 *      arch and size decisions are based on actual output instead of guesses.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RELEASE_ARTIFACT_EXTENSIONS = new Set(['.dmg', '.zip'])

export const formatBinarySize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`

export const collectReleaseArtifacts = (distDir) => {
  if (!existsSync(distDir)) {
    return []
  }

  return readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      const extension = name.endsWith('.dmg') ? '.dmg' : name.endsWith('.zip') ? '.zip' : null
      return extension !== null && RELEASE_ARTIFACT_EXTENSIONS.has(extension)
    })
    .sort()
    .map((name) => {
      const path = join(distDir, name)
      const bytes = statSync(path).size
      return {
        name,
        path,
        bytes,
        sizeLabel: formatBinarySize(bytes)
      }
    })
}

const walkDirectories = (rootDir, visit) => {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = join(rootDir, entry.name)
    visit(entryPath, entry)

    if (entry.isDirectory()) {
      walkDirectories(entryPath, visit)
    }
  }
}

export const findAppExecutables = (distDir) => {
  if (!existsSync(distDir)) {
    return []
  }

  const executablePaths = []

  walkDirectories(distDir, (entryPath, entry) => {
    if (!entry.isFile()) {
      return
    }

    const normalized = entryPath.replace(/\\/g, '/')
    if (normalized.includes('.app/Contents/MacOS/')) {
      executablePaths.push(entryPath)
    }
  })

  return executablePaths.sort()
}

const runCommand = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export const collectExecutableMetadata = (executablePath) => ({
  path: executablePath,
  name: basename(executablePath),
  fileInfo: runCommand('file', [executablePath]),
  lipoInfo: runCommand('lipo', ['-info', executablePath])
})

const printArtifactSummary = (distDir) => {
  const artifacts = collectReleaseArtifacts(distDir)
  if (artifacts.length === 0) {
    // Fail early before the upload step if the release build did not produce
    // the artifact types this repository expects to ship.
    console.error(`[release-artifacts] no .dmg or .zip files found under ${distDir}`)
    process.exitCode = 1
    return
  }

  console.log('[release-artifacts] packaged files')
  for (const artifact of artifacts) {
    console.log(`- ${artifact.name}: ${artifact.sizeLabel} (${artifact.bytes} bytes)`)
  }

  const appExecutables = findAppExecutables(distDir)
  if (appExecutables.length === 0) {
    console.log('[release-artifacts] no .app executables found under dist/ for architecture inspection')
    return
  }

  console.log('[release-artifacts] app executables')
  for (const executablePath of appExecutables) {
    const metadata = collectExecutableMetadata(executablePath)
    console.log(`- ${metadata.path}`)
    console.log(`  file: ${metadata.fileInfo ?? 'unavailable'}`)
    console.log(`  lipo: ${metadata.lipoInfo ?? 'unavailable'}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const distDir = process.argv[2] ?? join(process.cwd(), 'dist')
  printArtifactSummary(distDir)
}
