/*
 * Where: src/main/core/package-build-config.test.ts
 * What: Regression tests for Electron packaging inputs declared in package.json.
 * Why: Prevent non-runtime resources from being bundled into the packaged app
 *      while preserving the extraResources contract for tray and sound assets.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type BuildConfig = {
  files: string[]
  extraResources: Array<{
    from: string
    to: string
  }>
  mac: {
    icon: string
  }
}

type PackageJson = {
  build: BuildConfig
}

const readBuildConfig = (): BuildConfig => {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson
  return packageJson.build
}

describe('package build config', () => {
  it('ships only compiled app files in build.files', () => {
    expect(readBuildConfig().files).toEqual(['out/**', 'package.json'])
  })

  it('keeps runtime sound and tray assets in extraResources', () => {
    expect(readBuildConfig().extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'resources/sounds',
          to: 'sounds'
        }),
        expect.objectContaining({
          from: 'resources/tray',
          to: 'tray'
        })
      ])
    )
  })

  it('keeps the mac icon as a build-time resource path', () => {
    expect(readBuildConfig().mac.icon).toBe('resources/icon/dock-icon.png')
  })
})
