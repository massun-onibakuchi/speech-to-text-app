/*
 * Where: site/src/app.tsx
 * What: React landing page for Dicta, including locale switcher and stylized product mockups.
 * Why: Deliver a GitHub Pages-friendly product LP that follows the app brand while marketing shipped value.
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { copyByLocale, type Locale } from './content'
import { persistLocale, resolveInitialLocale } from './locale'

const RELEASES_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app/releases'
const REPOSITORY_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app'
const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noreferrer'
} as const
const HERO_THREAD_MESSAGES = [
  {
    author: 'Nina',
    time: '10:02 AM',
    body: 'The client wants the Q3 pricing brief before lunch.'
  },
  {
    author: 'Bob',
    time: '10:03 AM',
    body: 'I am pulling the last margin updates now so the pricing brief is ready for the client review.'
  }
] as const
const HERO_COMPOSER_MESSAGE =
  'The Q3 brief now reflects the approved margin. Finance can review the revised sheet this morning. If timing holds, I will send the client version before lunch.'
const HERO_COMPOSER_WORDS = HERO_COMPOSER_MESSAGE.split(' ')
const HERO_WORD_REVEAL_MS = 140
const HERO_LOOP_PAUSE_MS = 1400
const HERO_TITLE_ROTATE_MS = 2000
const HERO_PREVIEW_ROTATE_MS = 3000
const PREVIEW_SCENES = ['slack', 'notes', 'claude'] as const
type PreviewScene = (typeof PREVIEW_SCENES)[number]

const SHOWCASE_ILLUSTRATION_COPY = {
  en: {
    transformation: {
      shortcut: '⌘ + ↩ Run selected profile',
      draftLabel: 'Instruction',
      draftText: 'make this update less messy and send to team maybe clean it up and add action items',
      promptLabel: 'Formatted prompt',
      promptText: 'Rewrite into a concise team update with action items, owners, and a calm professional tone.'
    },
    profile: {
      status: 'Saved profile',
      name: 'Weekly client follow-up',
      fields: [
        ['Email', 'On'],
        ['Prompt', 'Polish into a client-ready note'],
        ['Translation', 'Japanese -> English']
      ]
    },
    dictionary: {
      title: 'Dictionary',
      rows: [
        ['Dicta', 'Always keep product spelling'],
        ['ScribeFlow', 'Internal codename'],
        ['Nari Labs', 'Preferred customer spelling']
      ]
    }
  },
  ja: {
    transformation: {
      shortcut: '⌘ + ↩ 選択中プロファイルを実行',
      draftLabel: '指示メモ',
      draftText: 'これ少し整えてチーム向けに送れる形にして アクションも入れて',
      promptLabel: '整形後プロンプト',
      promptText: 'チーム共有用に簡潔に書き直し、アクション項目と担当を付け、落ち着いた文体に整える。'
    },
    profile: {
      status: '保存済みプロファイル',
      name: '週次クライアント返信',
      fields: [
        ['Email', 'オン'],
        ['Prompt', 'クライアント向けに整える'],
        ['Translation', '日本語 -> 英語']
      ]
    },
    dictionary: {
      title: '辞書',
      rows: [
        ['Dicta', '製品名の表記を固定'],
        ['ScribeFlow', '社内コードネーム'],
        ['Nari Labs', '顧客名の優先表記']
      ]
    }
  }
} as const

const HERO_PREVIEW_COPY = {
  en: {
    scenes: {
      slack: 'Slack',
      notes: 'Apple Notes',
      claude: 'Claude Code'
    },
    notes: {
      listHeading: 'Today',
      notes: [
        {
          title: 'New note',
          preview: 'No addition...',
          meta: '10:26PM'
        },
        {
          title: 'Dream where I fo...',
          preview: 'When I put it t...',
          meta: '7:15PM'
        },
        {
          title: 'List of books',
          preview: 'Doctor Faustu...',
          meta: '7:12PM'
        }
      ],
      noteMeta: 'March 12, 2026 at 10:26PM',
      noteTitle: "Today's to-do list:",
      bullets: [
        'Review pull requests',
        'Finish API documentation',
        'Call with design team at 3pm'
      ]
    },
    claude: {
      appTitle: 'Claude Code',
      workspace: 'tmux new /workspace',
      tab: 'Claude Code',
      tabIndexLeft: '⌘1',
      tabIndexRight: '⌘2',
      version: 'Claude Code v2.1.45',
      model: 'Sonnet 4.6 • Claude Pro',
      path: '~/dev/speech-to-text-app',
      promptMarker: '❯',
      promptGhost: '▉',
      shortcutHint: '? for shortcuts'
    }
  },
  ja: {
    scenes: {
      slack: 'Slack',
      notes: 'Apple Notes',
      claude: 'Claude Code'
    },
    notes: {
      listHeading: 'Today',
      notes: [
        {
          title: 'New note',
          preview: 'No addition...',
          meta: '10:26PM'
        },
        {
          title: 'Dream where I fo...',
          preview: 'When I put it t...',
          meta: '7:15PM'
        },
        {
          title: 'List of books',
          preview: 'Doctor Faustu...',
          meta: '7:12PM'
        }
      ],
      noteMeta: 'March 12, 2026 at 10:26PM',
      noteTitle: "Today's to-do list:",
      bullets: [
        'Review pull requests',
        'Finish API documentation',
        'Call with design team at 3pm'
      ]
    },
    claude: {
      appTitle: 'Claude Code',
      workspace: 'tmux new /workspace',
      tab: 'Claude Code',
      tabIndexLeft: '⌘1',
      tabIndexRight: '⌘2',
      version: 'Claude Code v2.1.45',
      model: 'Sonnet 4.6 • Claude Pro',
      path: '~/dev/speech-to-text-app',
      promptMarker: '❯',
      promptGhost: '▉',
      shortcutHint: '? for shortcuts'
    }
  }
} as const

const renderSlackPreviewScene = (visibleComposerWords: number) => (
  <>
    <div className="mockup-topbar mockup-topbar-slack">
      <span className="window-dot" />
      <span className="window-dot" />
      <span className="window-dot" />
      <div className="mockup-toolbar-nav">
        <span className="mockup-nav-arrow">←</span>
        <span className="mockup-nav-arrow">→</span>
      </div>
      <div className="mockup-searchbar">Search</div>
      <div className="mockup-help">?</div>
    </div>
    <div className="slack-app-shell">
      <aside className="slack-left-rail">
        <div className="slack-rail-badge">H</div>
        <div className="slack-rail-item is-active">
          <span className="slack-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="m3 7.649-.33.223a.75.75 0 0 1-.84-1.244l7.191-4.852a1.75 1.75 0 0 1 1.958 0l7.19 4.852a.75.75 0 1 1-.838 1.244L17 7.649v7.011c0 2.071-1.679 3.84-3.75 3.84h-6.5C4.679 18.5 3 16.731 3 14.66zM11 11a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1z"
              />
            </svg>
          </span>
          <span>Home</span>
        </div>
        <div className="slack-rail-item">
          <span className="slack-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M7.675 6.468a4.75 4.75 0 1 1 8.807 3.441.75.75 0 0 0-.067.489l.379 1.896-1.896-.38a.75.75 0 0 0-.489.068 5 5 0 0 1-.648.273.75.75 0 1 0 .478 1.422q.314-.105.611-.242l2.753.55a.75.75 0 0 0 .882-.882l-.55-2.753A6.25 6.25 0 1 0 6.23 6.064a.75.75 0 1 0 1.445.404M6.5 8.5a5 5 0 0 0-4.57 7.03l-.415 2.073a.75.75 0 0 0 .882.882l2.074-.414A5 5 0 1 0 6.5 8.5m-3.5 5a3.5 3.5 0 1 1 1.91 3.119.75.75 0 0 0-.49-.068l-1.214.243.243-1.215a.75.75 0 0 0-.068-.488A3.5 3.5 0 0 1 3 13.5"
              />
            </svg>
          </span>
          <span>DMs</span>
        </div>
        <div className="slack-rail-item">
          <span className="slack-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9.357 3.256c-.157.177-.31.504-.36 1.062l-.05.558-.55.11c-1.024.204-1.691.71-2.145 1.662-.485 1.016-.736 2.566-.752 4.857l-.002.307-.217.217-2.07 2.077c-.145.164-.193.293-.206.374a.3.3 0 0 0 .034.199c.069.12.304.321.804.321h4.665l.07.672c.034.327.17.668.4.915.214.232.536.413 1.036.413.486 0 .802-.178 1.013-.41.227-.247.362-.588.396-.916l.069-.674h4.663c.5 0 .735-.202.804-.321a.3.3 0 0 0 .034-.199c-.013-.08-.061-.21-.207-.374l-2.068-2.077-.216-.217-.002-.307c-.015-2.291-.265-3.841-.75-4.857-.455-.952-1.123-1.458-2.147-1.663l-.549-.11-.05-.557c-.052-.558-.204-.885-.36-1.062C10.503 3.1 10.31 3 10 3s-.505.1-.643.256m-1.124-.994C8.689 1.746 9.311 1.5 10 1.5s1.31.246 1.767.762c.331.374.54.85.65 1.383 1.21.369 2.104 1.136 2.686 2.357.604 1.266.859 2.989.894 5.185l1.866 1.874.012.012.011.013c.636.7.806 1.59.372 2.342-.406.705-1.223 1.072-2.103 1.072H12.77c-.128.39-.336.775-.638 1.104-.493.538-1.208.896-2.12.896-.917 0-1.638-.356-2.136-.893A3 3 0 0 1 7.23 16.5H3.843c-.88 0-1.697-.367-2.104-1.072-.433-.752-.263-1.642.373-2.342l.011-.013.012-.012 1.869-1.874c.035-2.196.29-3.919.894-5.185.582-1.22 1.475-1.988 2.684-2.357.112-.533.32-1.009.651-1.383"
              />
            </svg>
          </span>
          <span>Activity</span>
        </div>
        <div className="slack-rail-item">
          <span className="slack-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="6.5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="17.5" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </span>
          <span>More</span>
        </div>
        <div className="slack-rail-profile">
          <span className="slack-rail-profile-avatar">B</span>
          <span className="slack-rail-profile-status" />
        </div>
      </aside>
      <aside className="slack-channel-sidebar">
        <div className="slack-workspace-head">
          <strong>Dicta HQ</strong>
          <span>⌄</span>
        </div>
        <div className="slack-sidebar-section">
          <div className="slack-nav-item is-strong">Unreads</div>
          <div className="slack-nav-item">Drafts and sent</div>
        </div>
        <div className="slack-sidebar-section">
          <span className="slack-sidebar-label">Channels</span>
          <div className="slack-channel-item">#general</div>
          <div className="slack-channel-item is-selected">#dev</div>
        </div>
        <div className="slack-sidebar-section">
          <span className="slack-sidebar-label">Direct messages</span>
          <div className="slack-dm-item">
            <span className="slack-dm-avatar">N</span>
            <span>Nina</span>
          </div>
          <div className="slack-dm-item">
            <span className="slack-dm-avatar">B</span>
            <span>Bob</span>
          </div>
        </div>
      </aside>
      <section className="note-surface">
        <div className="note-surface-head">
          <div className="note-surface-meta">
            <strong>#dev</strong>
          </div>
          <div className="note-surface-actions">
            <span className="note-surface-action">◻</span>
            <span className="note-surface-action">◌</span>
            <span className="note-surface-action">＋</span>
          </div>
        </div>
        <div className="slack-surface">
          <div className="slack-welcome">
            <p className="slack-welcome-icon">👋</p>
            <strong>Welcome to the #dev channel</strong>
            <p>Use this thread to align on engineering updates and send client-ready drafts quickly.</p>
          </div>
          <div className="slack-day-divider">
            <span>Today</span>
          </div>
          <div className="slack-thread">
            {HERO_THREAD_MESSAGES.map((message) => (
              <div className="slack-message" key={`${message.author}-${message.time}`}>
                <div className={`slack-avatar${message.author === 'Bob' ? ' slack-avatar-user' : ' slack-avatar-system'}`}>
                  {message.author.slice(0, 1)}
                </div>
                <div className="slack-message-body">
                  <div className="slack-message-meta">
                    <strong>{message.author}</strong>
                    <span>{message.time}</span>
                  </div>
                  <p>{message.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="slack-composer">
            <div className="slack-composer-box">
              <p className="composer-text">
                {HERO_COMPOSER_WORDS.map((word, wordIndex, words) => (
                  <Fragment key={`${word}-${wordIndex}`}>
                    <span className={`composer-word${wordIndex < visibleComposerWords ? ' is-visible' : ''}`}>
                      {word}
                    </span>
                    {wordIndex < words.length - 1 ? ' ' : null}
                  </Fragment>
                ))}
              </p>
              <div className="slack-composer-tools">
                <span className="slack-composer-tool slack-composer-tool-plus">+</span>
                <span className="slack-composer-tool">☺</span>
                <span className="slack-composer-tool">@</span>
                <span className="slack-composer-tool slack-composer-tool-type">Aa</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </>
)

const renderNotesPreviewScene = (locale: Locale) => {
  const notesCopy = HERO_PREVIEW_COPY[locale].notes

  return (
    <div className="notes-window">
      <div className="notes-window-topbar">
        <span className="window-dot notes-dot-close" />
        <span className="window-dot notes-dot-min" />
        <span className="window-dot notes-dot-max" />
      </div>
      <div className="notes-window-body">
        <aside className="notes-list-pane">
          <div className="notes-list-heading">{notesCopy.listHeading}</div>
          <div className="notes-list">
            {notesCopy.notes.map((note, noteIndex) => (
              <article className={`notes-list-item${noteIndex === 0 ? ' is-selected' : ''}`} key={note.title}>
                <strong>{note.title}</strong>
                <div className="notes-list-item-meta">
                  <span>{note.meta}</span>
                  <span>{note.preview}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>
        <section className="notes-editor">
          <div className="notes-editor-head">
            <span>{notesCopy.noteMeta}</span>
          </div>
          <div className="notes-editor-page">
            <strong className="notes-note-title">{notesCopy.noteTitle}</strong>
            <ul className="notes-bullets">
              {notesCopy.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <span className="notes-caret" aria-hidden="true">
              |
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

const renderClaudePreviewScene = (locale: Locale) => {
  const claudeCopy = HERO_PREVIEW_COPY[locale].claude

  return (
    <div className="claude-window">
      <div className="claude-window-topbar">
        <span className="window-dot notes-dot-close" />
        <span className="window-dot notes-dot-min" />
        <span className="window-dot notes-dot-max" />
        <div className="claude-window-title">
          <span className="claude-window-folder">📁</span>
          <span>{claudeCopy.appTitle}</span>
        </div>
      </div>
      <div className="claude-terminal">
        <div className="claude-terminal-grid">
          <div className="claude-terminal-tabbar">
            <div className="claude-terminal-tab is-left">
              <span>{claudeCopy.workspace}</span>
              <span>{claudeCopy.tabIndexLeft}</span>
            </div>
            <div className="claude-terminal-tab is-center">
              <span>{claudeCopy.tab}</span>
            </div>
            <div className="claude-terminal-tab is-right">
              <span>{claudeCopy.tabIndexRight}</span>
              <span>＋</span>
            </div>
          </div>
          <div className="claude-session">
            <div className="claude-session-hero">
              <div className="claude-session-logo" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="claude-session-copy">
                <strong>{claudeCopy.version}</strong>
                <span>{claudeCopy.model}</span>
                <span>{claudeCopy.path}</span>
              </div>
            </div>
            <div className="claude-prompt-line">
              <span>{claudeCopy.promptMarker}</span>
              <span>{claudeCopy.promptGhost}</span>
            </div>
            <div className="claude-hint-line">{claudeCopy.shortcutHint}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const setMetadataContent = (selector: string, content: string) => {
  document.querySelector(selector)?.setAttribute('content', content)
}

const renderShowcaseIllustration = (locale: Locale, kind: 'transformation' | 'profile' | 'dictionary') => {
  if (kind === 'transformation') {
    const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].transformation

    return (
      <div className="showcase-surface showcase-surface-transformation">
        <div className="showcase-kbd-pill">{illustrationCopy.shortcut}</div>
        <div className="showcase-conversion-flow">
          <div className="showcase-panel">
            <span className="showcase-panel-label">{illustrationCopy.draftLabel}</span>
            <p className="showcase-messy-text">{illustrationCopy.draftText}</p>
          </div>
          <div className="showcase-conversion-arrow" />
          <div className="showcase-panel showcase-panel-accent">
            <span className="showcase-panel-label">{illustrationCopy.promptLabel}</span>
            <p className="showcase-formatted-text">{illustrationCopy.promptText}</p>
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'profile') {
    const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].profile

    return (
      <div className="showcase-surface showcase-surface-profile">
        <div className="showcase-profile-head">
          <span className="showcase-status-pill">{illustrationCopy.status}</span>
          <strong>{illustrationCopy.name}</strong>
        </div>
        <div className="showcase-profile-fields">
          {illustrationCopy.fields.map(([label, value]) => (
            <div className="showcase-profile-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].dictionary

  return (
    <div className="showcase-surface showcase-surface-dictionary">
      <div className="showcase-dictionary-head">
        <span className="showcase-status-dot" />
        <strong>{illustrationCopy.title}</strong>
      </div>
      <div className="showcase-dictionary-table">
        {illustrationCopy.rows.map(([term, note]) => (
          <div className="showcase-dictionary-row" key={term}>
            <strong>{term}</strong>
            <span>{note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const App = () => {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale())
  const [visibleComposerWords, setVisibleComposerWords] = useState(0)
  const [heroTitleIndex, setHeroTitleIndex] = useState(0)
  const [previewSceneIndex, setPreviewSceneIndex] = useState(0)
  const [isPreviewPaused, setIsPreviewPaused] = useState(false)

  const copy = copyByLocale[locale]
  const previewScene = PREVIEW_SCENES[previewSceneIndex]
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

    let timeoutId: number

    const scheduleNextFrame = (nextCount: number, delay: number) => {
      timeoutId = window.setTimeout(() => {
        if (nextCount > HERO_COMPOSER_WORDS.length) {
          setVisibleComposerWords(0)
          scheduleNextFrame(1, HERO_WORD_REVEAL_MS)
          return
        }

        setVisibleComposerWords(nextCount)
        scheduleNextFrame(
          nextCount + 1,
          nextCount === HERO_COMPOSER_WORDS.length ? HERO_LOOP_PAUSE_MS : HERO_WORD_REVEAL_MS
        )
      }, delay)
    }

    if (prefersReducedMotion) {
      setVisibleComposerWords(HERO_COMPOSER_WORDS.length)
      return
    }

    setVisibleComposerWords(0)
    scheduleNextFrame(1, HERO_WORD_REVEAL_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [prefersReducedMotion, previewScene])

  useEffect(() => {
    setHeroTitleIndex(0)

    if (prefersReducedMotion) {
      return
    }

    const intervalId = window.setInterval(() => {
      setHeroTitleIndex((currentIndex) => (currentIndex + 1) % copy.heroTitleRotatingWords.length)
    }, HERO_TITLE_ROTATE_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [copy.heroTitleRotatingWords, locale, prefersReducedMotion])

  useEffect(() => {
    if (prefersReducedMotion || isPreviewPaused) {
      return
    }

    const intervalId = window.setInterval(() => {
      setPreviewSceneIndex((currentIndex) => (currentIndex + 1) % PREVIEW_SCENES.length)
    }, HERO_PREVIEW_ROTATE_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isPreviewPaused, prefersReducedMotion])

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
          <div className="hero-copy">
            <p className="eyebrow">{copy.heroEyebrow}</p>
            <h1 className="hero-rotating-title">
              <span className="hero-title-lead">{copy.heroTitleLead} </span>
              <span
                className="hero-title-rotator"
                aria-label={copy.heroTitleRotatingWords.join(', ')}
                data-hero-word={copy.heroTitleRotatingWords[heroTitleIndex]}
              >
                <span className="hero-title-rotator-word" key={copy.heroTitleRotatingWords[heroTitleIndex]}>
                  {copy.heroTitleRotatingWords[heroTitleIndex]}
                </span>
              </span>
            </h1>
            <p className="hero-body">{copy.heroBody}</p>
            <div className="hero-actions">
              <a className="cta-primary" href={RELEASES_URL} {...EXTERNAL_LINK_PROPS}>
                {copy.heroPrimaryCta}
              </a>
              <a className="cta-secondary" href={REPOSITORY_URL} {...EXTERNAL_LINK_PROPS}>
                {copy.heroSecondaryCta}
              </a>
            </div>
          </div>

          <div
            className="hero-visual"
            aria-hidden="true"
            onMouseEnter={() => {
              setIsPreviewPaused(true)
            }}
            onMouseLeave={() => {
              setIsPreviewPaused(false)
            }}
            onFocus={() => {
              setIsPreviewPaused(true)
            }}
            onBlur={() => {
              setIsPreviewPaused(false)
            }}
            onFocusCapture={() => {
              setIsPreviewPaused(true)
            }}
            onBlurCapture={() => {
              setIsPreviewPaused(false)
            }}
            tabIndex={0}
          >
            <div className="hero-voice-pill">
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
              <span className="hero-voice-bar" />
            </div>
            <div className="hero-preview-shell" data-preview-scene={previewScene}>
              <div className="mockup mockup-main">
                {previewScene === 'slack'
                  ? renderSlackPreviewScene(visibleComposerWords)
                  : previewScene === 'notes'
                    ? renderNotesPreviewScene(locale)
                    : renderClaudePreviewScene(locale)}
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-heading section-heading-centered">
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
                  {renderShowcaseIllustration(locale, card.kind)}
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
