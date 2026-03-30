/*
 * Where: scripts/resolve-release-plan.test.ts
 * What: Tests for deciding when a release should run and which tag it should use.
 * Why: Prevent release workflow regressions around version bumps, tag validation,
 *      and manual release backfills.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readPackageVersion,
  resolveReleasePlan,
  resolveReleaseTag,
  toReleaseTag
} from './resolve-release-plan.mjs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dicta-release-plan-'))
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

describe('readPackageVersion', () => {
  it('reads the semver version from package.json', () => {
    const tempDir = makeTempDir()
    const packageJsonPath = join(tempDir, 'package.json')
    writeFileSync(packageJsonPath, JSON.stringify({ version: '0.2.0' }))

    expect(readPackageVersion(packageJsonPath)).toBe('0.2.0')
  })

  it('rejects an invalid package version', () => {
    const tempDir = makeTempDir()
    const packageJsonPath = join(tempDir, 'package.json')
    writeFileSync(packageJsonPath, JSON.stringify({ version: 'next' }))

    expect(() => readPackageVersion(packageJsonPath)).toThrow(
      'Expected package.json version to be a semver string'
    )
  })
})

describe('release tag helpers', () => {
  it('prefixes package versions with v', () => {
    expect(toReleaseTag('0.2.0')).toBe('v0.2.0')
  })

  it('accepts a matching pushed tag', () => {
    expect(
      resolveReleaseTag({
        refType: 'tag',
        refName: 'v0.2.0',
        packageVersion: '0.2.0'
      })
    ).toBe('v0.2.0')
  })

  it('rejects a pushed tag that does not match package.json', () => {
    expect(() =>
      resolveReleaseTag({
        refType: 'tag',
        refName: 'v0.2.1',
        packageVersion: '0.2.0'
      })
    ).toThrow('does not match package.json version tag v0.2.0')
  })
})

describe('resolveReleasePlan', () => {
  it('creates a tag and release for a main version bump push', () => {
    expect(
      resolveReleasePlan({
        eventName: 'push',
        refType: 'branch',
        refName: 'main',
        packageVersion: '0.2.0',
        previousPackageVersion: '0.1.2'
      })
    ).toEqual({
      tagName: 'v0.2.0',
      shouldRelease: true,
      shouldCreateTag: true,
      source: 'main_version_bump'
    })
  })

  it('skips a main push when package.json changed without a version bump', () => {
    expect(
      resolveReleasePlan({
        eventName: 'push',
        refType: 'branch',
        refName: 'main',
        packageVersion: '0.2.0',
        previousPackageVersion: '0.2.0'
      })
    ).toEqual({
      tagName: 'v0.2.0',
      shouldRelease: false,
      shouldCreateTag: false,
      source: 'skip'
    })
  })

  it('releases from an existing tag ref without creating a new tag', () => {
    expect(
      resolveReleasePlan({
        eventName: 'workflow_dispatch',
        refType: 'tag',
        refName: 'v0.2.0',
        packageVersion: '0.2.0',
        previousPackageVersion: '0.2.0'
      })
    ).toEqual({
      tagName: 'v0.2.0',
      shouldRelease: true,
      shouldCreateTag: false,
      source: 'tag'
    })
  })

  it('skips workflow_dispatch runs from branch refs', () => {
    expect(
      resolveReleasePlan({
        eventName: 'workflow_dispatch',
        refType: 'branch',
        refName: 'main',
        packageVersion: '0.2.0',
        previousPackageVersion: '0.2.0'
      })
    ).toEqual({
      tagName: 'v0.2.0',
      shouldRelease: false,
      shouldCreateTag: false,
      source: 'skip'
    })
  })

  it('skips non-main branch pushes', () => {
    expect(
      resolveReleasePlan({
        eventName: 'push',
        refType: 'branch',
        refName: 'feature/test',
        packageVersion: '0.2.0',
        previousPackageVersion: '0.1.2'
      })
    ).toEqual({
      tagName: 'v0.2.0',
      shouldRelease: false,
      shouldCreateTag: false,
      source: 'skip'
    })
  })
})
