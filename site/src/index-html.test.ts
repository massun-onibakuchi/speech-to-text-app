/*
 * Where: site/src/index-html.test.ts
 * What: Static HTML regression test for the landing-page shell.
 * Why: Keep the GitHub Pages entrypoint pointing at the shipped favicon asset.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('site HTML shell', () => {
  it('declares the public favicon asset', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />')
  })
})
