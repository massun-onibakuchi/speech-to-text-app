/*
 * Where: src/renderer/font-imports.test.ts
 * What: Regression tests for the renderer and site font subset import contract.
 * Why: Keep broad multi-script fontsource imports from creeping back into the
 *      shipped assets after the bundle-size reduction work.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FONT_STYLE_FILES = [
  'src/renderer/styles.css',
  'site/src/styles.css'
] as const

const REQUIRED_IMPORTS = [
  '@fontsource/inter/latin-400.css',
  '@fontsource/inter/latin-500.css',
  '@fontsource/inter/latin-600.css',
  '@fontsource/inter/latin-ext-400.css',
  '@fontsource/inter/latin-ext-500.css',
  '@fontsource/inter/latin-ext-600.css',
  '@fontsource/geist-mono/latin-400.css',
  '@fontsource/geist-mono/latin-500.css',
  '@fontsource/geist-mono/latin-ext-400.css',
  '@fontsource/geist-mono/latin-ext-500.css'
] as const

const FORBIDDEN_IMPORTS = [
  '@fontsource/inter/400.css',
  '@fontsource/inter/500.css',
  '@fontsource/inter/600.css',
  '@fontsource/geist-mono/400.css',
  '@fontsource/geist-mono/500.css',
  '@fontsource/inter/greek-400.css',
  '@fontsource/inter/cyrillic-400.css',
  '@fontsource/inter/vietnamese-400.css',
  '@fontsource/geist-mono/cyrillic-400.css'
] as const

const readStyleFile = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8')

describe('font subset imports', () => {
  it.each(FONT_STYLE_FILES)('%s keeps the validated latin subset imports', (relativePath) => {
    const contents = readStyleFile(relativePath)

    for (const requiredImport of REQUIRED_IMPORTS) {
      expect(contents).toContain(requiredImport)
    }

    for (const forbiddenImport of FORBIDDEN_IMPORTS) {
      expect(contents).not.toContain(forbiddenImport)
    }
  })
})
