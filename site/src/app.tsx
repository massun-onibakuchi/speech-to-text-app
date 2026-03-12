/*
 * Where: site/src/app.tsx
 * What: React landing page for Dicta, including locale switcher and stylized product mockups.
 * Why: Deliver a GitHub Pages-friendly product LP that follows the app brand while marketing shipped value.
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { copyByLocale, type Locale } from './content'
import {
  CLAUDE_ACTION_DELAY_MS,
  CLAUDE_PROMPT_CHUNK_CHARS,
  HERO_LOOP_PAUSE_MS,
  HERO_WORD_REVEAL_MS,
  NOTES_BULLETS_DELAY_MS,
  NOTES_SELECTION_DELAY_MS,
  PREVIEW_SCENES,
  getClaudePreviewActionLineCount,
  getClaudePreviewPromptText,
  getHeroDemoLabels,
  getHeroSceneRotateMs,
  getSlackComposerMessage,
  renderClaudePreviewScene,
  renderNotesPreviewScene,
  renderSlackPreviewScene,
  splitAnimatedText,
  type NotesPhase
} from './hero-previews'
import { persistLocale, resolveInitialLocale } from './locale'
import { renderShowcaseIllustration } from './showcase-illustrations'
import dictaDockIcon from '../../resources/icon/dock-icon.png'

const RELEASES_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app/releases'
const REPOSITORY_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app'
const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noreferrer'
} as const
const SHOWCASE_TRANSFORMATION_SWITCH_MS = 7000
const setMetadataContent = (selector: string, content: string) => {
  document.querySelector(selector)?.setAttribute('content', content)
}

export const App = () => {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale())
  const [visibleComposerWords, setVisibleComposerWords] = useState(0)
  const [heroSceneIndex, setHeroSceneIndex] = useState(0)
  const [notesPhase, setNotesPhase] = useState<NotesPhase>('selected')
  const [visibleClaudePromptChars, setVisibleClaudePromptChars] = useState(0)
  const [visibleClaudeActionLines, setVisibleClaudeActionLines] = useState(0)
  const [visibleMarkdownFrame, setVisibleMarkdownFrame] = useState(0)

  const copy = copyByLocale[locale]
  const previewScene = PREVIEW_SCENES[heroSceneIndex % PREVIEW_SCENES.length]
  const heroTitleWord = copy.heroTitleRotatingWords[heroSceneIndex % copy.heroTitleRotatingWords.length]
  const heroSceneRotateMs = useMemo(() => getHeroSceneRotateMs(locale), [locale])
  const heroDemoLabels = useMemo(() => getHeroDemoLabels(locale), [locale])
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const onSwitchLocale = (nextLocale: Locale) => {
    setLocale(nextLocale)
    persistLocale(nextLocale)
    document.documentElement.lang = nextLocale
  }

  useLayoutEffect(() => {
    document.documentElement.lang = locale
    document.title = copy.documentTitle
    setMetadataContent('#meta-description', copy.documentDescription)
    setMetadataContent('#meta-og-title', copy.documentTitle)
    setMetadataContent('#meta-og-description', copy.documentOgDescription)
  }, [copy, locale])

  useEffect(() => {
    if (previewScene !== 'slack') {
      return
    }

    const composerWordCount = splitAnimatedText(getSlackComposerMessage(locale)).length
    let timeoutId: number

    const scheduleNextFrame = (nextCount: number, delay: number) => {
      timeoutId = window.setTimeout(() => {
        if (nextCount > composerWordCount) {
          setVisibleComposerWords(0)
          scheduleNextFrame(1, HERO_WORD_REVEAL_MS)
          return
        }

        setVisibleComposerWords(nextCount)
        scheduleNextFrame(nextCount + 1, nextCount === composerWordCount ? HERO_LOOP_PAUSE_MS : HERO_WORD_REVEAL_MS)
      }, delay)
    }

    if (prefersReducedMotion) {
      setVisibleComposerWords(composerWordCount)
      return
    }

    setVisibleComposerWords(0)
    scheduleNextFrame(1, HERO_WORD_REVEAL_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [locale, prefersReducedMotion, previewScene])

  useEffect(() => {
    if (previewScene !== 'notes') {
      setNotesPhase('selected')
      return
    }

    if (prefersReducedMotion) {
      setNotesPhase('bullets')
      return
    }

    setNotesPhase('selected')
    const selectTimer = window.setTimeout(() => {
      setNotesPhase('selected')
    }, NOTES_SELECTION_DELAY_MS)
    const bulletsTimer = window.setTimeout(() => {
      setNotesPhase('bullets')
    }, NOTES_BULLETS_DELAY_MS)

    return () => {
      window.clearTimeout(selectTimer)
      window.clearTimeout(bulletsTimer)
    }
  }, [prefersReducedMotion, previewScene])

  useEffect(() => {
    if (previewScene !== 'claude') {
      setVisibleClaudePromptChars(0)
      setVisibleClaudeActionLines(0)
      return
    }

    const promptText = getClaudePreviewPromptText(locale)

    if (prefersReducedMotion) {
      setVisibleClaudePromptChars(promptText.length)
      setVisibleClaudeActionLines(getClaudePreviewActionLineCount(locale))
      return
    }

    let promptTimeoutId: number
    let actionIntervalId: number

    const revealPrompt = (nextCount: number) => {
      promptTimeoutId = window.setTimeout(() => {
        const clampedCount = Math.min(nextCount, promptText.length)

        setVisibleClaudePromptChars(clampedCount)

        if (clampedCount >= promptText.length) {
          let actionCount = 0
          actionIntervalId = window.setInterval(() => {
            actionCount += 1
            setVisibleClaudeActionLines(actionCount)
            if (actionCount >= getClaudePreviewActionLineCount(locale)) {
              window.clearInterval(actionIntervalId)
            }
          }, CLAUDE_ACTION_DELAY_MS)
          return
        }

        revealPrompt(nextCount + CLAUDE_PROMPT_CHUNK_CHARS)
      }, HERO_WORD_REVEAL_MS)
    }

    setVisibleClaudePromptChars(0)
    setVisibleClaudeActionLines(0)
    revealPrompt(CLAUDE_PROMPT_CHUNK_CHARS)

    return () => {
      window.clearTimeout(promptTimeoutId)
      window.clearInterval(actionIntervalId)
    }
  }, [locale, prefersReducedMotion, previewScene])

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleMarkdownFrame(1)
      return
    }

    const intervalId = window.setInterval(() => {
      setVisibleMarkdownFrame((current) => (current + 1) % 2)
    }, SHOWCASE_TRANSFORMATION_SWITCH_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [prefersReducedMotion])

  useEffect(() => {
    setHeroSceneIndex(0)
  }, [copy.heroTitleRotatingWords, locale])

  useEffect(() => {
    if (prefersReducedMotion) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setHeroSceneIndex((currentIndex) => (currentIndex + 1) % PREVIEW_SCENES.length)
    }, heroSceneRotateMs[previewScene])

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [heroSceneRotateMs, prefersReducedMotion, previewScene])

  return (
    <div className="lp-shell">
      <div className="lp-orb lp-orb-primary" aria-hidden="true" />
      <div className="lp-orb lp-orb-recording" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#hero" aria-label="Dicta home">
          <img className="brand-icon-image" src={dictaDockIcon} alt="" aria-hidden="true" />
          <span className="brand-copy">
            <span className="brand-title">Dicta</span>
          </span>
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#features">{copy.navFeature}</a>
          <a href="#workflow">{copy.navWorkflow}</a>
          <a href={RELEASES_URL} {...EXTERNAL_LINK_PROPS}>
            {copy.navDownload}
          </a>
        </nav>
        <div className="locale-switch" role="group" aria-label={copy.localeSwitchLabel}>
          <button
            type="button"
            className={locale === 'en' ? 'is-active' : ''}
            aria-pressed={locale === 'en'}
            onClick={() => {
              onSwitchLocale('en')
            }}
          >
            EN
          </button>
          <button
            type="button"
            className={locale === 'ja' ? 'is-active' : ''}
            aria-pressed={locale === 'ja'}
            onClick={() => {
              onSwitchLocale('ja')
            }}
          >
            JA
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="hero">
          <div className="hero-copy-stage">
            <div className="hero-copy">
              {copy.heroEyebrow ? <p className="eyebrow">{copy.heroEyebrow}</p> : null}
              <h1 className="hero-rotating-title">
                <span className="hero-title-lead">{copy.heroTitleLead}</span>
                <span className="hero-title-stack">
                  <span className="hero-title-bridge">{copy.heroTitleBridge}</span>
                  <span
                    className="hero-title-rotator"
                    aria-label={copy.heroTitleRotatingWords.join(', ')}
                    data-hero-word={heroTitleWord}
                  >
                    <span className="hero-title-rotator-word" key={`${locale}-${heroSceneIndex}-${heroTitleWord}`}>
                      {heroTitleWord}
                    </span>
                  </span>
                </span>
              </h1>
              <p className="hero-subtitle">Voice to Text for macOS</p>
              {copy.heroBody ? <p className="hero-body">{copy.heroBody}</p> : null}
              <div className="hero-actions">
                <a className="cta-primary" href={RELEASES_URL} {...EXTERNAL_LINK_PROPS}>
                  {copy.heroPrimaryCta}
                </a>
                <a className="cta-secondary" href={REPOSITORY_URL} {...EXTERNAL_LINK_PROPS}>
                  {copy.heroSecondaryCta}
                </a>
              </div>
            </div>
          </div>

          <div className="hero-demo">
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-preview-shell" data-preview-scene={previewScene}>
                <div className="mockup mockup-main">
                  {previewScene === 'slack'
                    ? renderSlackPreviewScene(locale, visibleComposerWords)
                    : previewScene === 'notes'
                      ? renderNotesPreviewScene(locale, notesPhase)
                      : renderClaudePreviewScene(locale, visibleClaudePromptChars, visibleClaudeActionLines)}
                </div>
              </div>
            </div>
            <div className="hero-demo-labels" aria-label="Preview contexts">
              {heroDemoLabels.map((item) => (
                <span className={`hero-demo-label${previewScene === item.scene ? ' is-active' : ''}`} key={item.scene}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-heading section-heading-centered">
            <p className="eyebrow">{copy.featureIntroEyebrow}</p>
            <h2 className="feature-intro-title">
              <span>{copy.featureIntroTitleLines[0]}</span>
              <span>{copy.featureIntroTitleLines[1]}</span>
            </h2>
            <p>{copy.featureIntroBody}</p>
          </div>
          <div className="feature-grid">
            {copy.features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <p className="feature-accent">{feature.accent}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section-band" id="workflow">
          <div className="section-heading section-heading-centered">
            <p className="eyebrow">{copy.workflowEyebrow}</p>
            <h2>{copy.workflowTitle}</h2>
          </div>
          <div className="workflow-grid">
            {copy.workflowSteps.map((step, index) => (
              <article className="workflow-step" key={step.title}>
                <span className="workflow-index">0{index + 1}</span>
                <div className="workflow-copy">
                  <h3>{step.title}</h3>
                  <p>
                    {step.body}
                    {step.shortcutText ? <span className="workflow-shortcut-highlight">{step.shortcutText}</span> : null}
                    {step.bodySuffix ?? ''}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">{copy.showcaseEyebrow}</p>
            <h2>{copy.showcaseTitle}</h2>
          </div>
          <div className="showcase-grid">
            {copy.showcaseCards.map((card) => (
              <article className="showcase-card" key={card.title}>
                <p className="feature-accent">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <div className="showcase-art" aria-hidden="true">
                  {renderShowcaseIllustration(locale, card.kind, visibleMarkdownFrame)}
                </div>
                {card.detail ? <p className="showcase-detail">{card.detail}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="section faq">
          <div className="section-heading">
            <p className="eyebrow">{copy.faqEyebrow}</p>
            <h2>{copy.faqTitle}</h2>
          </div>
          <div className="faq-list">
            {copy.faqItems.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section final-cta">
          <div className="final-cta-panel">
            <div className="final-cta-copy">
              <h2>{copy.finalTitle}</h2>
              <p>{copy.finalBody}</p>
            </div>
            <div className="hero-actions">
              <a className="cta-primary" href={RELEASES_URL} {...EXTERNAL_LINK_PROPS}>
                {copy.finalPrimaryCta}
              </a>
              <a className="cta-secondary" href={REPOSITORY_URL} {...EXTERNAL_LINK_PROPS}>
                {copy.heroSecondaryCta}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
