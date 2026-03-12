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
    expect(host.textContent).not.toContain('すばやく録って、きれいな文章に。')
    expect(host.textContent).toContain('検索')
    expect(host.textContent).toContain('アクティビティ')
    expect(Array.from(host.querySelectorAll('.hero-demo-label')).map((node) => node.textContent?.trim())).toEqual([
      'Notes',
      'Slack',
      'Terminal'
    ])
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

    expect(host.textContent).toContain('Download Dicta')
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

  it('renders the top-stacked Swiss Army Knife hero composition', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const rotatingWord = host.querySelector('.hero-title-rotator-word')?.textContent?.trim()
    const rotatingWordLabel = host.querySelector('.hero-title-rotator')?.getAttribute('data-hero-word')
    const hero = host.querySelector('.hero')
    const heroCopyStage = host.querySelector('.hero-copy-stage')
    const heroCopy = host.querySelector('.hero-copy')
    const heroDemo = host.querySelector('.hero-demo')
    const heroDemoLabels = host.querySelector('.hero-demo-labels')
    const heroVisual = host.querySelector('.hero-visual')
    const demoLabels = Array.from(host.querySelectorAll('.hero-demo-label')).map((node) => node.textContent?.trim())

    expect(hero).toBeTruthy()
    expect(heroCopyStage).toBeTruthy()
    expect(heroCopy).toBeTruthy()
    expect(heroDemo).toBeTruthy()
    expect(hero?.firstElementChild).toBe(heroCopyStage)
    expect(hero?.lastElementChild).toBe(heroDemo)
    expect(host.querySelector('.hero-title-lead')?.textContent?.trim()).toBe('The Swiss Army Knife')
    expect(host.querySelector('.hero-title-stack')).toBeTruthy()
    expect(host.querySelector('.hero-title-bridge')?.textContent?.trim()).toBe('for')
    expect(host.querySelector('.hero-rotating-title')).toBeTruthy()
    expect(host.querySelector('.hero-title-rotator')).toBeTruthy()
    expect(rotatingWord).toBe('Speech')
    expect(rotatingWordLabel).toBe('Speech')
    expect(demoLabels).toEqual(['Notes', 'Slack', 'Terminal'])
    expect(heroDemo?.firstElementChild).toBe(heroDemoLabels)
    expect(heroDemo?.lastElementChild).toBe(heroVisual)
    expect(host.querySelector('.hero-voice-pill')).toBeNull()
  })

  it('renders the Dicta dock icon asset in the header brand', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const brandIcon = host.querySelector<HTMLImageElement>('.brand-icon-image')
    const heroSubtitle = host.querySelector('.hero-subtitle')

    expect(brandIcon).toBeTruthy()
    expect(brandIcon?.getAttribute('src')).toContain('dock-icon.png')
    expect(heroSubtitle?.textContent?.trim()).toBe('Voice to Text for macOS')
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

    expect(host.textContent).toContain('Use Dicta in three steps')
    expect(host.textContent).toContain('Press ⌘ + Option + T to begin capturing audio.')
    expect(host.textContent).toContain('Say what you want. Dicta transcribes.')
    expect(host.textContent).toContain('Press ⌘ + Option + T again to finish.')
    expect(highlightedShortcuts).toEqual(['⌘ + Option + T', '⌘ + Option + T'])
  })

  it('renders the revised feature heading as two intentional lines', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const featureHeadingLines = Array.from(host.querySelectorAll('.feature-intro-title span')).map((node) =>
      node.textContent?.trim()
    )

    expect(featureHeadingLines).toEqual(['Speech is messy.', "Your text shouldn't be."])
    expect(host.textContent).toContain(
      'Speech becomes clean text fast enough to keep your train of thought.'
    )
    expect(host.textContent).toContain('Use your own models and scale without lock-in.')
  })

  it('renders the product showcase using the approved transformation, profile list, and dictionary table structures', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const showcaseHeadings = Array.from(host.querySelectorAll('.showcase-card h3')).map((heading) =>
      heading.textContent?.trim()
    )

    expect(host.textContent).toContain('Three tools for turning speech into usable text')
    expect(showcaseHeadings).toEqual([
      'Clean up dictation instantly',
      'Reusable text profiles',
      'Lock in names and jargon'
    ])
    expect(host.textContent).toContain('Turn rough speech into a structured prompt before it’s sent.')
    expect(host.textContent).toContain('Save formatting rules and transformations for repeat work.')
    expect(host.textContent).toContain('Keep apps, people, and domain terms correct.')
    expect(host.textContent).not.toContain('Japanese input')
    expect(host.textContent).toContain(
      'meeting w design team today homepage still too busy need cleaner copy faq spacing still off send revised build before friday'
    )
    expect(host.textContent).not.toContain('⌘ + ↩ Run selected profile')
    expect(host.textContent).toContain('Optimize Prompt')
    expect(host.textContent).toContain('+ add Profile')
    expect(host.textContent).toContain('key')
    expect(host.textContent).toContain('value')
    expect(host.textContent).toContain('Claude code')
    expect(host.textContent).toContain('Alice')
    expect(host.querySelectorAll('.showcase-surface')).toHaveLength(3)
    expect(host.querySelectorAll('.showcase-transform-text')).toHaveLength(1)
    expect(host.querySelector('.showcase-profile-fields')).toBeNull()
    expect(host.querySelectorAll('.showcase-profile-item')).toHaveLength(3)
    expect(host.querySelector('.showcase-dictionary-table')).toBeTruthy()
    expect(host.querySelector('.showcase-status-dot')).toBeNull()
  })

  it('opens external GitHub links in a new tab', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const releaseLink = Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).find(
      (link) => link.textContent?.trim() === 'Download Dicta'
    )
    const sourceLink = Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).find(
      (link) => link.textContent?.trim() === 'View on GitHub'
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
    expect(host.textContent).toContain('The client wants the Q3 pricing brief before lunch.')
    expect(host.textContent).not.toContain('I am pulling the last margin updates now so the pricing brief is ready for the client review.')
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
    expect(host.querySelector('.composer-word')?.getAttribute('style')).toBeNull()
  })

  it('keeps the hero labels in Notes, Slack, Terminal order and highlights the active scene', async () => {
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<App />)
    await flush()

    const labels = Array.from(host.querySelectorAll<HTMLElement>('.hero-demo-label'))

    expect(labels.map((node) => node.textContent?.trim())).toEqual(['Notes', 'Slack', 'Terminal'])
    expect(labels.find((node) => node.classList.contains('is-active'))?.textContent?.trim()).toBe('Slack')
  })

  it('rotates the headline independently from the demo scene timing', async () => {
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
    const heroWord = () => host.querySelector<HTMLElement>('.hero-title-rotator')?.getAttribute('data-hero-word')

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')
    expect(heroWord()).toBe('Speech')

    await act(async () => {
      vi.advanceTimersByTime(1801)
    })

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')
    expect(heroWord()).toBe('Ideas')

    await act(async () => {
      vi.advanceTimersByTime(3380)
    })

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('notes')
    expect(host.querySelector('.hero-demo-label.is-active')?.textContent?.trim()).toBe('Notes')
    expect(host.textContent).toContain('New note')
  })

  it('disables hero autoplay when reduced motion is enabled', async () => {
    vi.useFakeTimers()
    languageGetter = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    const previewShell = () => host.querySelector<HTMLElement>('.hero-preview-shell')
    const heroWord = () => host.querySelector<HTMLElement>('.hero-title-rotator')?.getAttribute('data-hero-word')

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')
    expect(heroWord()).toBe('Speech')

    await act(async () => {
      vi.advanceTimersByTime(9000)
    })

    expect(previewShell()?.getAttribute('data-preview-scene')).toBe('slack')
    expect(heroWord()).toBe('Speech')
  })

  it('animates Apple Notes selection into a bullet list', async () => {
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

    await act(async () => {
      vi.advanceTimersByTime(5181)
    })

    expect(host.querySelector('.hero-preview-shell')?.getAttribute('data-preview-scene')).toBe('notes')
    expect(host.textContent).toContain("Today's to-do")
    expect(host.textContent).toContain('Review pull then finish API documentation and')
    expect(host.querySelector('.notes-draft-block.is-selected')).toBeTruthy()
    expect(host.querySelector('.notes-bullets-block.is-visible')).toBeFalsy()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(host.textContent).toContain("Today's to-do list:")
    expect(host.textContent).toContain('Finish API documentation')
    expect(host.querySelector('.notes-bullets-block.is-visible')).toBeTruthy()
  })

  it('renders the Claude preview with an orange single-tab welcome frame', async () => {
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

    await act(async () => {
      vi.advanceTimersByTime(5181)
    })

    await act(async () => {
      vi.advanceTimersByTime(4501)
    })

    expect(host.querySelector('.hero-preview-shell')?.getAttribute('data-preview-scene')).toBe('claude')
    expect(host.textContent).toContain('Claude Code v2.1.74')
    expect(host.querySelector('.claude-terminal-tabbar')).toBeNull()
    expect(host.querySelector('.claude-terminal-tab')).toBeNull()
    expect(host.textContent).toContain('~/develop/whisper.cpp')
    expect(host.textContent).toContain('Opus 4.6 · Claude Pro')
    expect(host.querySelector('.claude-welcome-frame')).toBeTruthy()
    expect(host.querySelector('.claude-logo-image')).toBeTruthy()
  })

  it('reveals the Claude prompt in short character chunks before action lines start', async () => {
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

    await act(async () => {
      vi.advanceTimersByTime(5181)
    })

    await act(async () => {
      vi.advanceTimersByTime(4501)
    })

    const promptLine = () => host.querySelector('.claude-prompt-lines p')?.textContent ?? ''

    expect(promptLine()).toBe('')

    await act(async () => {
      vi.advanceTimersByTime(141)
    })

    expect(promptLine()).toBe('In @')
    expect(host.querySelector('.claude-action-line.is-visible')).toBeFalsy()

    await act(async () => {
      vi.advanceTimersByTime(7000)
    })

    expect(promptLine()).toContain('but not instant like it is now.')
  })

  it('keeps hero preview autoplay running while focused', async () => {
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
      vi.advanceTimersByTime(5181)
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

    await act(async () => {
      japaneseButton?.click()
      await flush()
    })

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja')
    expect(host.textContent).toContain('GitHub Releasesから入手')
    expect(host.textContent).not.toContain('すばやく録って、きれいな文章に。')
    expect(document.documentElement.lang).toBe('ja')
    expect(document.querySelector('#meta-og-description')?.getAttribute('content')).toContain('macOSで、思考が消える前に声を使って文章へ変える')
  })
})
