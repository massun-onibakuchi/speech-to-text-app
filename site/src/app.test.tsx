/*
 * Where: site/src/app.test.tsx
 * What: Component tests for locale resolution and landing-page rendering.
 * Why: Guard the GitHub Pages LP against regressions in locale auto-detection and manual preference behavior.
 */

// @vitest-environment jsdom

import { act } from 'react'
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
let matchMediaMock: { mockRestore: () => void } | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  matchMediaMock = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  window.localStorage.clear()
  document.head.innerHTML = ''
  ensureMetadataTags()
})

afterEach(() => {
  vi.useRealTimers()
  languageGetter?.mockRestore()
  languageGetter = null
  matchMediaMock?.mockRestore()
  matchMediaMock = null
  root?.unmount()
  root = null
  document.body.innerHTML = ''
  document.documentElement.lang = ''
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
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

  it('does not render the hero highlight list', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    expect(host.querySelector('.hero-meta')).toBeNull()
    expect(host.querySelector('[aria-label="Product highlights"]')).toBeNull()
  })

  it('renders the rotating Swiss Army Knife hero headline', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const rotatingWord = host.querySelector('.hero-title-rotator-word')?.textContent?.trim()
    const rotatingWordLabel = host.querySelector('.hero-title-rotator')?.getAttribute('data-hero-word')

    expect(host.textContent).toContain('The Swiss Army Knife for')
    expect(host.querySelector('.hero-rotating-title')).toBeTruthy()
    expect(host.querySelector('.hero-title-rotator')).toBeTruthy()
    expect(rotatingWord).toBe('Work')
    expect(rotatingWordLabel).toBe('Work')
  })

  it('renders the FAQ section as a vertical accordion', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const faqHeading = Array.from(host.querySelectorAll('h2')).find((heading) => heading.textContent === 'FAQ')
    const faqQuestions = Array.from(host.querySelectorAll('.faq-item summary')).map((summary) => summary.textContent?.trim())

    expect(faqHeading).toBeTruthy()
    expect(host.querySelectorAll('.faq-item')).toHaveLength(3)
    expect(host.querySelectorAll('.faq-item summary')).toHaveLength(3)
    expect(host.querySelector('.faq-card')).toBeNull()
    expect(faqQuestions).toEqual([
      'Can I try Dicta for free?',
      'What platform does Dicta support?',
      'Where do I get it?'
    ])
  })

  it('shows the default recording shortcut in the usage section', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const highlightedShortcuts = Array.from(host.querySelectorAll('.workflow-shortcut-highlight')).map((node) =>
      node.textContent?.trim()
    )

    expect(host.textContent).toContain('Trigger ⌘ + Option + T (default) to start capture the moment you are ready.')
    expect(host.textContent).toContain('Trigger ⌘ + Option + T (default) again to stop and send the capture forward.')
    expect(highlightedShortcuts).toEqual(['⌘ + Option + T', '⌘ + Option + T'])
  })

  it('renders the revised feature copy as tight single-line product statements', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    expect(host.textContent).toContain('Built for the messy reality of spoken work.')
    expect(host.textContent).toContain(
      'Raw speech lands as clean copy fast enough to stay inside the same train of thought.'
    )
    expect(host.textContent).toContain(
      'Bring your own model budget and scale from personal notes to team throughput without lock-in.'
    )
  })

  it('renders the product showcase around transformation, reusable profiles, and custom dictionary views', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const showcaseHeadings = Array.from(host.querySelectorAll('.showcase-card h3')).map((heading) =>
      heading.textContent?.trim()
    )

    expect(host.textContent).toContain('Three views that make Dicta feel immediate and reusable.')
    expect(showcaseHeadings).toEqual([
      'Turn a messy instruction into a clean prompt in one move',
      'Keep the right setup ready for repeat work',
      'Lock in names, jargon, and product language'
    ])
    expect(host.textContent).toContain('⌘ + ↩ Run selected profile')
    expect(host.textContent).toContain('Weekly client follow-up')
    expect(host.textContent).toContain('Nari Labs')
    expect(host.querySelectorAll('.showcase-surface')).toHaveLength(3)
  })

  it('opens external GitHub links in a new tab', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const releaseLink = Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).find(
      (link) => link.textContent?.trim() === 'Get Dicta on GitHub Releases'
    )
    const sourceLink = Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).find(
      (link) => link.textContent?.trim() === 'View source on GitHub'
    )

    expect(releaseLink?.getAttribute('target')).toBe('_blank')
    expect(releaseLink?.getAttribute('rel')).toBe('noreferrer')
    expect(sourceLink?.getAttribute('target')).toBe('_blank')
    expect(sourceLink?.getAttribute('rel')).toBe('noreferrer')
  })

  it('renders animated Slack-like composer text in the hero mockup', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const composerTexts = Array.from(host.querySelectorAll('.composer-text')).map((node) => node.textContent?.trim())
    const composerWords = Array.from(host.querySelectorAll<HTMLElement>('.composer-word'))

    expect(host.textContent).toContain('#dev')
    expect(host.textContent).toContain('#general')
    expect(host.textContent).toContain('#dev')
    expect(host.textContent).toContain('Nina')
    expect(host.textContent).toContain('Bob')
    expect(host.textContent).toContain('The client wants the Q3 pricing brief before lunch.')
    expect(host.textContent).toContain(
      'I am pulling the last margin updates now so the pricing brief is ready for the client review.'
    )
    expect(host.textContent).not.toContain('Frontmost app')
    expect(host.textContent).not.toContain('Return to send')
    expect(host.textContent).not.toContain('Message #dev')
    expect(host.textContent).toContain('Activity')
    expect(composerTexts).toEqual([
      'The Q3 brief now reflects the approved margin. Finance can review the revised sheet this morning. If timing holds, I will send the client version before lunch.'
    ])
    expect(composerWords.length).toBeGreaterThan(10)
    expect(host.querySelectorAll('.composer-text')).toHaveLength(1)
    expect(host.querySelectorAll('.slack-composer-tool')).toHaveLength(4)
  })

  it('rotates the hero preview scenes in the order slack -> notes -> claude', async () => {
    vi.useFakeTimers()
    matchMediaMock?.mockRestore()
    matchMediaMock = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    const previewShell = () => host.querySelector<HTMLElement>('.hero-preview-shell')

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('notes')
    expect(host.textContent).toContain('New note')

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('claude')
    expect(host.textContent).toContain('Claude Code')
    expect(host.textContent).toContain('Claude Code v2.1.45')
  })

  it('pauses hero preview autoplay while focused', async () => {
    vi.useFakeTimers()
    matchMediaMock?.mockRestore()
    matchMediaMock = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    const heroVisual = host.querySelector<HTMLElement>('.hero-visual')
    const previewShell = () => host.querySelector<HTMLElement>('.hero-preview-shell')

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')

    await act(async () => {
      heroVisual?.focus()
    })

    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')

    await act(async () => {
      heroVisual?.blur()
    })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('notes')
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
