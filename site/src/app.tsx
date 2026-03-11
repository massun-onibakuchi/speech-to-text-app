/*
 * Where: site/src/app.tsx
 * What: React landing page for Dicta, including locale switcher and stylized product mockups.
 * Why: Deliver a GitHub Pages-friendly product LP that follows the app brand while marketing shipped value.
 */

import { useLayoutEffect, useState } from 'react'
import { copyByLocale, type Locale } from './content'
import { persistLocale, resolveInitialLocale } from './locale'

const RELEASES_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app/releases'
const REPOSITORY_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app'

const setMetadataContent = (selector: string, content: string) => {
  document.querySelector(selector)?.setAttribute('content', content)
}

export const App = () => {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale())

  const copy = copyByLocale[locale]

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

  return (
    <div className="lp-shell">
      <div className="lp-orb lp-orb-primary" aria-hidden="true" />
      <div className="lp-orb lp-orb-recording" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#hero" aria-label="Dicta home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Dicta</span>
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#features">{copy.navFeature}</a>
          <a href="#workflow">{copy.navWorkflow}</a>
          <a href={RELEASES_URL}>{copy.navDownload}</a>
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
          <div className="hero-copy">
            <p className="eyebrow">{copy.heroEyebrow}</p>
            <h1>{copy.heroTitle}</h1>
            <p className="hero-body">{copy.heroBody}</p>
            <div className="hero-actions">
              <a className="cta-primary" href={RELEASES_URL}>
                {copy.heroPrimaryCta}
              </a>
              <a className="cta-secondary" href={REPOSITORY_URL}>
                {copy.heroSecondaryCta}
              </a>
            </div>
            <ul className="hero-meta" aria-label={copy.heroMetaLabel}>
              {copy.heroMeta.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-floater hero-floater-top">
              <span className="floater-dot floater-dot-primary" />
              <div className="floater-lines">
                <span className="floater-line wide" />
                <span className="floater-line narrow" />
              </div>
            </div>
            <div className="hero-floater hero-floater-bottom">
              <span className="floater-dot floater-dot-recording" />
              <div className="floater-lines">
                <span className="floater-line wide" />
                <span className="floater-line accent" />
              </div>
            </div>
            <div className="mockup mockup-main">
              <div className="mockup-topbar">
                <span className="window-dot" />
                <span className="window-dot" />
                <span className="window-dot" />
                <div className="status-pill">
                  <span className="status-live" />
                  <span>{copy.mockupRecording}</span>
                </div>
              </div>
              <div className="mockup-grid">
                <div className="mockup-panel mockup-left">
                  <div className="record-ring">
                    <div className="record-ring-core" />
                  </div>
                  <p className="mockup-time">00:18</p>
                  <p className="mockup-caption">{copy.mockupCaption}</p>
                </div>
                <div className="mockup-panel mockup-right">
                  <div className="text-line long" />
                  <div className="text-line short" />
                  <div className="text-line medium accent" />
                  <div className="text-line long" />
                  <div className="text-line medium" />
                  <div className="text-line short accent" />
                </div>
              </div>
              <div className="waveform">
                {Array.from({ length: 30 }, (_, index) => (
                  <span
                    key={index}
                    style={{
                      height: `${8 + ((index * 7) % 26)}px`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-heading">
            <p className="eyebrow">{copy.featureIntroEyebrow}</p>
            <h2>{copy.featureIntroTitle}</h2>
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
          <div className="section-heading">
            <p className="eyebrow">{copy.workflowEyebrow}</p>
            <h2>{copy.workflowTitle}</h2>
          </div>
          <div className="workflow-grid">
            {copy.workflowSteps.map((step, index) => (
              <article className="workflow-step" key={step.title}>
                <span className="workflow-index">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
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
                  <div className="showcase-surface">
                    <div className="showcase-chip" />
                    <div className="showcase-row wide" />
                    <div className="showcase-row" />
                    <div className="showcase-row accent" />
                  </div>
                </div>
                <p className="showcase-detail">{card.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section faq">
          <div className="section-heading">
            <p className="eyebrow">{copy.faqEyebrow}</p>
            <h2>{copy.faqTitle}</h2>
          </div>
          <div className="faq-grid">
            {copy.faqItems.map((item) => (
              <article className="faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
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
              <a className="cta-primary" href={RELEASES_URL}>
                {copy.finalPrimaryCta}
              </a>
              <a className="cta-secondary" href={REPOSITORY_URL}>
                {copy.heroSecondaryCta}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
