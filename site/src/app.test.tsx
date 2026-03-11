/*
 * Where: site/src/app.test.tsx
 * What: Component tests for locale resolution and landing-page rendering.
 * Why: Guard the GitHub Pages LP against regressions in locale auto-detection and manual preference behavior.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './app'
import { LOCALE_STORAGE_KEY } from './locale'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const ensureMetadataTags = () => {
  const description = document.createElement('meta')
  description.id = 'meta-description'
  description.setAttribute('name', 'description')
  document.head.append(description)

  const ogTitle = document.createElement('meta')
  ogTitle.id = 'meta-og-title'
  ogTitle.setAttribute('property', 'og:title')
  document.head.append(ogTitle)

  const ogDescription = document.createElement('meta')
  ogDescription.id = 'meta-og-description'
  ogDescription.setAttribute('property', 'og:description')
  document.head.append(ogDescription)
}

let root: Root | null = null
let languageGetter: ReturnType<typeof vi.spyOn> | null = null

beforeEach(() => {
  window.localStorage.clear()
  document.head.innerHTML = ''
  ensureMetadataTags()
})

afterEach(() => {
  languageGetter?.mockRestore()
  languageGetter = null
  root?.unmount()
  root = null
  document.body.innerHTML = ''
  document.documentElement.lang = ''
})

describe('Dicta landing page locale behavior', () => {
  it('auto-selects Japanese when browser preference starts with ja', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ja-JP')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    expect(host.textContent).toContain('GitHub Releasesから入手')
    expect(document.documentElement.lang).toBe('ja')
    expect(document.title).toBe('Dicta')
    expect(document.querySelector('#meta-description')?.getAttribute('content')).toContain('macOS向け音声入力アプリ')
  })

  it('uses the saved manual locale preference when present', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ja-JP')
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    expect(host.textContent).toContain('Get Dicta on GitHub Releases')
    expect(host.textContent).not.toContain('GitHub Releasesから入手')
    expect(document.documentElement.lang).toBe('en')
    expect(document.querySelector('#meta-description')?.getAttribute('content')).toContain('macOS speech-to-text app')
  })

  it('persists a manual language switch after the user clicks the locale toggle', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const japaneseButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'JA'
    )

    japaneseButton?.click()
    await flush()

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja')
    expect(host.textContent).toContain('GitHub Releasesから入手')
    expect(document.documentElement.lang).toBe('ja')
    expect(document.querySelector('#meta-og-description')?.getAttribute('content')).toContain('macOSで、思考が消える前に声を使って文章へ変える')
  })
})
