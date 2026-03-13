/*
 * Where: scripts/report-release-artifacts.test.ts
 * What: Unit tests for release artifact reporting helpers.
 * Why: Keep the release metadata step stable without needing a macOS packaging
 *      run in every local test pass.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectReleaseArtifacts,
  findAppExecutables,
  formatBinarySize
} from './report-release-artifacts.mjs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dicta-release-artifacts-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true })
    }
  }
})

describe('formatBinarySize', () => {
  it('formats bytes as MiB with two decimals', () => {
    expect(formatBinarySize(1048576)).toBe('1.00 MiB')
  })
})

describe('collectReleaseArtifacts', () => {
  it('finds and sorts dmg and zip artifacts only', () => {
    const distDir = makeTempDir()
    writeFileSync(join(distDir, 'Dicta-1.0.0.dmg'), 'a'.repeat(10))
    writeFileSync(join(distDir, 'Dicta-1.0.0.zip'), 'b'.repeat(20))
    writeFileSync(join(distDir, 'notes.txt'), 'ignore me')

    expect(collectReleaseArtifacts(distDir).map((artifact) => artifact.name)).toEqual([
      'Dicta-1.0.0.dmg',
      'Dicta-1.0.0.zip'
    ])
  })
})

describe('findAppExecutables', () => {
  it('finds binaries inside app bundles under dist', () => {
    const distDir = makeTempDir()
    const binaryDir = join(distDir, 'mac-arm64', 'Dicta.app', 'Contents', 'MacOS')
    mkdirSync(binaryDir, { recursive: true })
    writeFileSync(join(binaryDir, 'Dicta'), 'binary')

    expect(findAppExecutables(distDir)).toEqual([join(binaryDir, 'Dicta')])
  })
})
