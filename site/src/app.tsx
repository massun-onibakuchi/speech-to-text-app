/*
 * Where: site/src/app.tsx
 * What: React landing page for Dicta, including locale switcher and stylized product mockups.
 * Why: Deliver a GitHub Pages-friendly product LP that follows the app brand while marketing shipped value.
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { copyByLocale, type Locale } from './content'
import { persistLocale, resolveInitialLocale } from './locale'
import claudeCodeLogo from '../../resources/icon/claude-code.svg'
import dictaDockIcon from '../../resources/icon/dock-icon.png'

const RELEASES_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app/releases'
const REPOSITORY_URL = 'https://github.com/massun-onibakuchi/speech-to-text-app'
const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noreferrer'
} as const
const HERO_SLACK_COPY = {
  en: {
    ui: {
      search: 'Search',
      home: 'Home',
      dms: 'DMs',
      activity: 'Activity',
      more: 'More',
      unreads: 'Unreads',
      draftsAndSent: 'Drafts and sent',
      channels: 'Channels',
      directMessages: 'Direct messages',
      welcomeTitle: 'Welcome to the #dev channel',
      welcomeBody: 'Use this thread to align on engineering updates and send client-ready drafts quickly.',
      today: 'Today'
    },
    messages: [
      {
        author: 'Nina',
        time: '10:02 AM',
        body: 'The client wants the Q3 pricing brief before lunch.'
      }
    ],
    composerMessage:
      'The Q3 brief now reflects the approved margin. Finance can review the revised sheet this morning. If timing holds, I will send the client version before lunch.'
  },
  ja: {
    ui: {
      search: '検索',
      home: 'ホーム',
      dms: 'DM',
      activity: 'アクティビティ',
      more: 'その他',
      unreads: '未読',
      draftsAndSent: '下書きと送信済み',
      channels: 'チャンネル',
      directMessages: 'ダイレクトメッセージ',
      welcomeTitle: '#dev チャンネルへようこそ',
      welcomeBody: 'このスレッドで開発の更新をそろえて、クライアント向けの下書きをすばやく整えます。',
      today: '今日'
    },
    messages: [
      {
        author: 'Nina',
        time: '10:02 AM',
        body: 'クライアントが昼までにQ3の価格ブリーフを見たいそうです。'
      }
    ],
    composerMessage:
      'Q3ブリーフは承認済みの粗利で更新しました。Financeは今朝のうちに確認できます。間に合えば昼前にクライアント版を送ります。'
  }
} as const
const HERO_WORD_REVEAL_MS = 140
const HERO_LOOP_PAUSE_MS = 1400
const HERO_TITLE_ROTATE_MS = 1800
const SHOWCASE_TRANSFORMATION_SWITCH_MS = 7000
const NOTES_SELECTION_DELAY_MS = 820
const NOTES_BULLETS_DELAY_MS = 1460
const NOTES_SCENE_HOLD_MS = 3040
const CLAUDE_ACTION_DELAY_MS = 480
const CLAUDE_PROMPT_CHUNK_CHARS = 4
const CLAUDE_SCENE_HOLD_MS = 800
const PREVIEW_SCENES = ['slack', 'notes', 'claude'] as const
type PreviewScene = (typeof PREVIEW_SCENES)[number]
type NotesPhase = 'selected' | 'bullets'
const HERO_DEMO_LABELS = [
  { scene: 'notes', label: 'Notes' },
  { scene: 'slack', label: 'Slack' },
  { scene: 'claude', label: 'Terminal' }
] as const satisfies ReadonlyArray<{ scene: PreviewScene; label: string }>

const splitAnimatedText = (text: string) => {
  if (text.includes(' ')) {
    return text.split(' ')
  }

  return text.match(/.{1,4}/gu) ?? [text]
}

const SHOWCASE_ILLUSTRATION_COPY = {
  en: {
    transformation: {
      phaseRaw: '',
      phaseReady: '',
      frames: [
        {
          status: 'Before transformation',
          text:
            'meeting w design team today homepage still too busy need cleaner copy faq spacing still off send revised build before friday'
        },
        {
          status: 'After transformation',
          text:
            'Meeting summary:\n- Met with the design team today.\n- The homepage still feels too busy.\n- Update the copy so it reads more cleanly.\n- Tighten the FAQ spacing.\n- Send the revised build before Friday.'
        }
      ]
    },
    profile: {
      listLabel: 'Profiles',
      profiles: ['Translation', 'Optimize Prompt', 'Business'],
      addLabel: '+ add Profile',
      selectedProfile: 'Optimize Prompt'
    },
    dictionary: {
      title: 'User dictionary',
      headers: ['key', 'value'],
      rows: [
        ['clade code', 'Claude code'],
        ['codex', 'Codex'],
        ['pull request', 'PR'],
        ['User A', 'Alice']
      ]
    }
  },
  ja: {
    transformation: {
      phaseRaw: '',
      phaseReady: '',
      frames: [
        {
          status: '変換前',
          text:
            'meeting w design team today homepage still too busy need cleaner copy faq spacing still off send revised build before friday'
        },
        {
          status: '変換後',
          text:
            'Meeting summary:\n- Met with the design team today.\n- The homepage still feels too busy.\n- Update the copy so it reads more cleanly.\n- Tighten the FAQ spacing.\n- Send the revised build before Friday.'
        }
      ]
    },
    profile: {
      listLabel: 'プロファイル',
      profiles: ['Translation', 'Optimize Prompt', 'Business'],
      addLabel: '+ プロファイルを追加',
      selectedProfile: 'Optimize Prompt'
    },
    dictionary: {
      title: 'ユーザー辞書',
      headers: ['入力語', '置換後'],
      rows: [
        ['clade code', 'Claude code'],
        ['codex', 'Codex'],
        ['pull request', 'PR'],
        ['User A', 'Alice']
      ]
    }
  }
} as const

const HERO_PREVIEW_COPY = {
  en: {
    scenes: {
      slack: 'Slack',
      notes: 'Notes',
      claude: 'Terminal'
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
          title: 'List of books',
          preview: 'Doctor Faustu...',
          meta: '7:15PM'
        }
      ],
      noteMeta: 'March 12, 2026 at 10:26PM',
      draftTitle: "Today's to-do",
      draftLines: ['- Review pull then finish API documentation and', '- call with design team at 3pm then'],
      noteTitle: "Today's to-do list:",
      bullets: [
        'Review pull requests',
        'Finish API documentation',
        'Call with design team at 3pm'
      ]
    },
    claude: {
      appTitle: 'Claude Code',
      workspace: '/workspace/.worktrees/feat/github-pages-product-lp',
      tab: 'Claude Code',
      path: '/workspace/.worktrees/feat/github-pages-product-lp',
      promptMarker: '❯',
      shortcutHint: '? for shortcuts',
      promptText:
        'In @shape-generator.js can you add a nice morphing transition when I click generate? Like they morph from square to circle and vice versa or just fade out, but not instant like it is now.',
      actionLines: [
        'Read(shape-generator.html)',
        'Read 1395 lines',
        "I'll add a smooth morphing transition with fade and border-radius animation",
        'when generating new shapes.'
      ]
    }
  },
  ja: {
    scenes: {
      slack: 'Slack',
      notes: 'メモ',
      claude: 'ターミナル'
    },
    notes: {
      listHeading: '今日',
      notes: [
        {
          title: '新規メモ',
          preview: '追加内容なし...',
          meta: '10:26PM'
        },
        {
          title: '本のメモ',
          preview: 'ドクトル・ファウ...',
          meta: '7:15PM'
        }
      ],
      noteMeta: '2026年3月12日 10:26PM',
      draftTitle: '今日のやること',
      draftLines: ['- pull requestを確認して API documentation を仕上げる', '- 3pmにデザインチームと打ち合わせ'],
      noteTitle: '今日のやること:',
      bullets: [
        'pull requestを確認する',
        'API documentationを仕上げる',
        '3pmにデザインチームと打ち合わせ'
      ]
    },
    claude: {
      appTitle: 'Claude Code',
      workspace: '/workspace/.worktrees/feat/github-pages-product-lp',
      tab: 'Claude Code',
      path: '/workspace/.worktrees/feat/github-pages-product-lp',
      promptMarker: '❯',
      shortcutHint: '? でショートカット',
      promptText:
        '@shape-generator.js で generate を押したときに、いい感じのモーフィング遷移を追加できますか。四角から丸へ、あるいはその逆に変形するか、少なくとも今みたいに瞬時ではなくフェードしてほしいです。',
      actionLines: [
        'Read(shape-generator.html)',
        '1395行を確認',
        'フェードと border-radius アニメーションを使った',
        'なめらかなモーフィング遷移を追加します。'
      ]
    }
  }
} as const

const CLAUDE_WELCOME_LINES = ['Claude Code v2.1.74', 'Opus 4.6 · Claude Pro', '~/develop/whisper.cpp'] as const

const getHeroSceneRotateMs = (locale: Locale) =>
  ({
    slack: splitAnimatedText(HERO_SLACK_COPY[locale].composerMessage).length * HERO_WORD_REVEAL_MS + HERO_LOOP_PAUSE_MS,
    notes: NOTES_BULLETS_DELAY_MS + NOTES_SCENE_HOLD_MS,
    claude:
      Math.ceil(HERO_PREVIEW_COPY[locale].claude.promptText.length / CLAUDE_PROMPT_CHUNK_CHARS) * HERO_WORD_REVEAL_MS +
      HERO_PREVIEW_COPY[locale].claude.actionLines.length * CLAUDE_ACTION_DELAY_MS +
      CLAUDE_SCENE_HOLD_MS
  }) satisfies Record<PreviewScene, number>

const renderSlackPreviewScene = (locale: Locale, visibleComposerWords: number) => {
  const slackCopy = HERO_SLACK_COPY[locale]
  const composerWords = splitAnimatedText(slackCopy.composerMessage)

  return (
    <>
    <div className="mockup-topbar mockup-topbar-slack">
      <span className="window-dot" />
      <span className="window-dot" />
      <span className="window-dot" />
      <div className="mockup-toolbar-nav">
        <span className="mockup-nav-arrow">←</span>
        <span className="mockup-nav-arrow">→</span>
      </div>
      <div className="mockup-searchbar">{slackCopy.ui.search}</div>
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
          <span>{slackCopy.ui.home}</span>
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
          <span>{slackCopy.ui.dms}</span>
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
          <span>{slackCopy.ui.activity}</span>
        </div>
        <div className="slack-rail-item">
          <span className="slack-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="6.5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="17.5" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </span>
          <span>{slackCopy.ui.more}</span>
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
          <div className="slack-nav-item is-strong">{slackCopy.ui.unreads}</div>
          <div className="slack-nav-item">{slackCopy.ui.draftsAndSent}</div>
        </div>
        <div className="slack-sidebar-section">
          <span className="slack-sidebar-label">{slackCopy.ui.channels}</span>
          <div className="slack-channel-item">#general</div>
          <div className="slack-channel-item is-selected">#dev</div>
        </div>
        <div className="slack-sidebar-section">
          <span className="slack-sidebar-label">{slackCopy.ui.directMessages}</span>
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
            <span className="note-surface-action">＋</span>
          </div>
        </div>
        <div className="slack-surface">
          <div className="slack-welcome">
            <p className="slack-welcome-icon">👋</p>
            <strong>{slackCopy.ui.welcomeTitle}</strong>
            <p>{slackCopy.ui.welcomeBody}</p>
          </div>
          <div className="slack-day-divider">
            <span>{slackCopy.ui.today}</span>
          </div>
          <div className="slack-thread">
            {slackCopy.messages.map((message) => (
              <div className="slack-message" key={`${message.author}-${message.time}`}>
                <div className="slack-avatar slack-avatar-system">
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
                {composerWords.map((word, wordIndex, words) => (
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
}

const renderNotesPreviewScene = (locale: Locale, notesPhase: NotesPhase) => {
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
            {notesPhase !== 'bullets' ? (
              <div className={`notes-draft-block${notesPhase === 'selected' ? ' is-selected' : ''}`}>
                <strong className="notes-note-title">{notesCopy.draftTitle}</strong>
                <div className="notes-draft-copy" role="presentation">
                  {notesCopy.draftLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  <span className="notes-caret" aria-hidden="true">
                    |
                  </span>
                </div>
              </div>
            ) : null}
            <div className={`notes-bullets-block${notesPhase === 'bullets' ? ' is-visible' : ''}`}>
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
          </div>
        </section>
      </div>
    </div>
  )
}

const renderClaudePreviewScene = (locale: Locale, visiblePromptChars: number, visibleActionLines: number) => {
  const claudeCopy = HERO_PREVIEW_COPY[locale].claude
  const visiblePrompt = claudeCopy.promptText.slice(0, visiblePromptChars)

  return (
    <div className="claude-window">
      <div className="claude-window-topbar">
        <span className="window-dot notes-dot-close" />
        <span className="window-dot notes-dot-min" />
        <span className="window-dot notes-dot-max" />
      </div>
      <div className="claude-terminal">
        <div className="claude-terminal-grid">
          <div className="claude-session">
            <div className="claude-welcome-frame">
              <img className="claude-logo-image" src={claudeCodeLogo} alt="" aria-hidden="true" />
              <div className="claude-welcome-copy">
                {CLAUDE_WELCOME_LINES.map((line) => (
                  <div className="claude-welcome-line" key={line}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="claude-prompt-copy">
              <span className="claude-prompt-marker">{claudeCopy.promptMarker}</span>
              <div className="claude-prompt-lines">
                <p>{visiblePrompt}</p>
              </div>
            </div>
            <div className="claude-action-stream">
              {claudeCopy.actionLines.map((line, lineIndex) => (
                <div className={`claude-action-line${lineIndex < visibleActionLines ? ' is-visible' : ''}`} key={line}>
                  {line}
                </div>
              ))}
            </div>
            <div className="claude-hint-line">
              <span>{claudeCopy.shortcutHint}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const renderShowcaseIllustration = (
  locale: Locale,
  kind: 'transformation' | 'profile' | 'dictionary',
  visibleMarkdownFrame: number
) => {
  if (kind === 'transformation') {
    const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].transformation
    const currentFrame = illustrationCopy.frames[visibleMarkdownFrame]

    return (
      <div className="showcase-surface showcase-surface-transformation">
        <div className="showcase-panel">
          <div className="showcase-transform-head">
            <span className="showcase-panel-label">{currentFrame.status}</span>
            {visibleMarkdownFrame === 0 && illustrationCopy.phaseRaw ? (
              <span className="showcase-transform-phase">{illustrationCopy.phaseRaw}</span>
            ) : null}
          </div>
          <pre className={`showcase-transform-text${visibleMarkdownFrame === 0 ? ' is-raw' : ' is-formatted'}`}>
            <code key={`${locale}-${visibleMarkdownFrame}`}>{currentFrame.text}</code>
          </pre>
        </div>
      </div>
    )
  }

  if (kind === 'profile') {
    const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].profile

    return (
      <div className="showcase-surface showcase-surface-profile">
        <div className="showcase-profile-label">{illustrationCopy.listLabel}</div>
        <div className="showcase-profile-list">
          {illustrationCopy.profiles.map((profile) => (
            <div
              className={`showcase-profile-item${profile === illustrationCopy.selectedProfile ? ' is-selected' : ''}`}
              key={profile}
            >
              {profile}
            </div>
          ))}
          <div className="showcase-profile-add">{illustrationCopy.addLabel}</div>
        </div>
      </div>
    )
  }

  const illustrationCopy = SHOWCASE_ILLUSTRATION_COPY[locale].dictionary

  return (
    <div className="showcase-surface showcase-surface-dictionary">
      <div className="showcase-dictionary-head">
        <strong>{illustrationCopy.title}</strong>
      </div>
      <table className="showcase-dictionary-table">
        <thead>
          <tr className="showcase-dictionary-header">
            <th scope="col">{illustrationCopy.headers[0]}</th>
            <th scope="col">{illustrationCopy.headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {illustrationCopy.rows.map(([term, note]) => (
            <tr className="showcase-dictionary-row" key={term}>
              <th scope="row">{term}</th>
              <td>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const setMetadataContent = (selector: string, content: string) => {
  document.querySelector(selector)?.setAttribute('content', content)
}

export const App = () => {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale())
  const [visibleComposerWords, setVisibleComposerWords] = useState(0)
  const [heroSceneIndex, setHeroSceneIndex] = useState(0)
  const [heroTitleWordIndex, setHeroTitleWordIndex] = useState(0)
  const [notesPhase, setNotesPhase] = useState<NotesPhase>('selected')
  const [visibleClaudePromptChars, setVisibleClaudePromptChars] = useState(0)
  const [visibleClaudeActionLines, setVisibleClaudeActionLines] = useState(0)
  const [visibleMarkdownFrame, setVisibleMarkdownFrame] = useState(0)

  const copy = copyByLocale[locale]
  const previewScene = PREVIEW_SCENES[heroSceneIndex % PREVIEW_SCENES.length]
  const heroTitleWord = copy.heroTitleRotatingWords[heroTitleWordIndex % copy.heroTitleRotatingWords.length]
  const heroSceneRotateMs = useMemo(() => getHeroSceneRotateMs(locale), [locale])
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

    const composerWordCount = splitAnimatedText(HERO_SLACK_COPY[locale].composerMessage).length
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

    const promptText = HERO_PREVIEW_COPY[locale].claude.promptText

    if (prefersReducedMotion) {
      setVisibleClaudePromptChars(promptText.length)
      setVisibleClaudeActionLines(HERO_PREVIEW_COPY[locale].claude.actionLines.length)
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
            if (actionCount >= HERO_PREVIEW_COPY[locale].claude.actionLines.length) {
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
  }, [locale])

  useEffect(() => {
    setHeroTitleWordIndex(0)
  }, [copy.heroTitleRotatingWords, locale])

  useEffect(() => {
    if (prefersReducedMotion) {
      return
    }

    const intervalId = window.setInterval(() => {
      setHeroTitleWordIndex((currentIndex) => (currentIndex + 1) % copy.heroTitleRotatingWords.length)
    }, HERO_TITLE_ROTATE_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [copy.heroTitleRotatingWords.length, prefersReducedMotion])

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
                    <span className="hero-title-rotator-word" key={`${locale}-${heroTitleWordIndex}-${heroTitleWord}`}>
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
            <div className="hero-demo-labels" aria-label="Preview contexts">
              {HERO_DEMO_LABELS.map((item) => (
                <span className={`hero-demo-label${previewScene === item.scene ? ' is-active' : ''}`} key={item.scene}>
                  {item.label}
                </span>
              ))}
            </div>
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
