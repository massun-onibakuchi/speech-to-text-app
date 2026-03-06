/**
 * Where: src/main/core/mac-icon-config.test.ts
 * What:  Validates the configured macOS app dock icon path and minimum PNG dimensions.
 * Why:   Prevent packaging regressions where an undersized or missing dock icon ships.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = resolve(__dirname, '../../..')
const PACKAGE_JSON_PATH = resolve(PROJECT_ROOT, 'package.json')

const readPngSize = (filePath: string): { width: number; height: number } => {
  const data = readFileSync(filePath)
  const pngSignature = '89504e470d0a1a0a'
  expect(data.subarray(0, 8).toString('hex')).toBe(pngSignature)
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  return { width, height }
}

describe('mac icon config', () => {
  it('points build.mac.icon to an existing PNG that is at least 512x512', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      build?: { mac?: { icon?: string } }
    }

    const configuredIcon = pkg.build?.mac?.icon
    expect(typeof configuredIcon).toBe('string')

    const resolvedIconPath = resolve(PROJECT_ROOT, configuredIcon!)
    const { width, height } = readPngSize(resolvedIconPath)
    expect(width).toBeGreaterThanOrEqual(512)
    expect(height).toBeGreaterThanOrEqual(512)
  })
})
