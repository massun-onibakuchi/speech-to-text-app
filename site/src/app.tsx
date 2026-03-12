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
const HERO_PREVIEW_ROTATE_MS = 3200
const NOTES_FRAME_STEP_MS = 760
const CLAUDE_WELCOME_HOLD_MS = 900
const CLAUDE_PROMPT_WORD_MS = 95
const CLAUDE_OUTPUT_LINE_MS = 340
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
      appTitle: 'Notes',
      toolbarLabel: 'All iCloud',
      searchLabel: 'Search',
      foldersTitle: 'Folders',
      folders: [
        ['Quick Notes', '12'],
        ['Dicta', '8'],
        ['Client Threads', '14']
      ],
      notesTitle: 'Notes',
      notes: [
        {
          title: 'Dicta prompt cleanup',
          preview: 'Turn the rough voice note into a clearer task list.',
          meta: '10:13 AM'
        },
        {
          title: 'Launch page polish',
          preview: 'Tighten hero spacing and give the CTA more contrast.',
          meta: 'Yesterday'
        },
        {
          title: 'Support reply',
          preview: 'Explain profiles, dictionary entries, and pay-as-you-go usage.',
          meta: 'Mon'
        }
      ],
      noteTitle: 'Dicta prompt cleanup',
      noteMeta: 'Today at 10:13 AM',
      noteTag: 'Edited just now',
      draftLabel: 'Raw voice note',
      draft: 'follow up with design team and summarize blockers before the review',
      actionLabel: 'Selected with Dicta',
      bulletsLabel: 'Cleaned for action',
      bullets: [
        'Follow up with the design team',
        'Summarize blockers before the review',
        'Share the action list in the project thread'
      ]
    },
    claude: {
      status: 'Connected',
      path: '~/dev/kestrel-ui',
      branch: 'main',
      title: 'Ready to ship',
      subtitle: 'Claude Code in the project workspace',
      prompt:
        'Refine the landing page preview cards so the Notes scene feels native and the Claude scene reads like a real session.',
      output: [
        'Scanning hero preview components and shared tokens',
        'Drafting the Notes.app chrome and interaction states',
        'Preparing the Claude Code terminal pass with cleaner pacing'
      ],
      diffTitle: 'Files touched',
      diffFiles: ['site/src/app.tsx', 'site/src/styles.css'],
      footer: 'Enter to apply, Esc to cancel'
    }
  },
  ja: {
    scenes: {
      slack: 'Slack',
      notes: 'Apple Notes',
      claude: 'Claude Code'
    },
    notes: {
      appTitle: 'メモ',
      toolbarLabel: 'iCloud すべて',
      searchLabel: '検索',
      foldersTitle: 'フォルダ',
      folders: [
        ['クイックメモ', '12'],
        ['Dicta', '8'],
        ['クライアント対応', '14']
      ],
      notesTitle: 'メモ',
      notes: [
        {
          title: 'Dicta prompt cleanup',
          preview: '荒い音声メモを、そのまま動けるタスクリストに整える。',
          meta: '10:13'
        },
        {
          title: 'LP polish',
          preview: 'ヒーローの余白を詰めて、CTA の見え方を強くする。',
          meta: '昨日'
        },
        {
          title: 'サポート返信',
          preview: 'プロフィール、辞書、従量課金を簡潔に説明する。',
          meta: '月'
        }
      ],
      noteTitle: 'Dicta prompt cleanup',
      noteMeta: '今日 10:13',
      noteTag: 'たった今更新',
      draftLabel: '音声メモ',
      draft: 'design team に確認して review 前に blocker を整理する',
      actionLabel: 'Dicta で選択中',
      bulletsLabel: 'すぐ使える形',
      bullets: [
        'design team に確認する',
        'review 前に blocker を整理する',
        'action list をプロジェクトスレッドに共有する'
      ]
    },
    claude: {
      status: '接続済み',
      path: '~/dev/kestrel-ui',
      branch: 'main',
      title: '作業を再開できます',
      subtitle: 'Claude Code がワークスペースに接続中',
      prompt:
        'LP のプレビューカードを整えて、Notes は macOS らしく、Claude は実際の作業画面らしく見せてください。',
      output: [
        'ヒーロープレビューの構成と共有トークンを確認',
        'Notes.app のクロームと選択状態を設計',
        'Claude Code のターミナル表示を整えて反映準備'
      ],
      diffTitle: '変更ファイル',
      diffFiles: ['site/src/app.tsx', 'site/src/styles.css'],
      footer: 'Enter で適用 / Esc で閉じる'
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

const renderNotesPreviewScene = (locale: Locale, notesFrameIndex: number) => {
  const notesCopy = HERO_PREVIEW_COPY[locale].notes
  const showingBullets = notesFrameIndex >= 2
  const showingSelection = notesFrameIndex === 1

  return (
    <div className="notes-window">
      <div className="notes-window-topbar">
        <span className="window-dot notes-dot-close" />
        <span className="window-dot notes-dot-min" />
        <span className="window-dot notes-dot-max" />
        <div className="notes-topbar-toolbar">
          <span className="notes-toolbar-pill">{notesCopy.toolbarLabel}</span>
          <span className="notes-toolbar-search">{notesCopy.searchLabel}</span>
        </div>
        <div className="notes-topbar-title">{notesCopy.appTitle}</div>
      </div>
      <div className="notes-window-body">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-section-title">{notesCopy.foldersTitle}</div>
          {notesCopy.folders.map(([folder, count], folderIndex) => (
            <div className={`notes-folder-item${folderIndex === 1 ? ' is-selected' : ''}`} key={folder}>
              <span className="notes-folder-icon" />
              <span>{folder}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </aside>
        <aside className="notes-list-pane">
          <div className="notes-list-head">
            <strong>{notesCopy.notesTitle}</strong>
            <span>3</span>
          </div>
          <div className="notes-list">
            {notesCopy.notes.map((note, noteIndex) => (
              <article className={`notes-list-item${noteIndex === 0 ? ' is-selected' : ''}`} key={note.title}>
                <div className="notes-list-item-head">
                  <strong>{note.title}</strong>
                  <span>{note.meta}</span>
                </div>
                <p>{note.preview}</p>
              </article>
            ))}
          </div>
        </aside>
        <section className="notes-editor">
          <div className="notes-editor-head">
            <div>
              <strong>{notesCopy.noteTitle}</strong>
              <span>{notesCopy.noteMeta}</span>
            </div>
            <em>{notesCopy.noteTag}</em>
          </div>
          <div className="notes-editor-page" data-notes-frame={showingBullets ? 'bullets' : showingSelection ? 'selected' : 'draft'}>
            <div className="notes-page-label-row">
              <span className="notes-page-label">
                {showingBullets ? notesCopy.bulletsLabel : notesCopy.draftLabel}
              </span>
              {showingSelection ? <span className="notes-page-action">{notesCopy.actionLabel}</span> : null}
            </div>
            {!showingBullets ? (
              <p className={`notes-draft-line${showingSelection ? ' is-selected' : ''}`}>{notesCopy.draft}</p>
            ) : (
              <ul className="notes-bullets">
                {notesCopy.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const renderClaudePreviewScene = (locale: Locale, promptWordCount: number, outputLineCount: number) => {
  const claudeCopy = HERO_PREVIEW_COPY[locale].claude
  const claudePromptWords = claudeCopy.prompt.split(' ')
  const showPrompt = promptWordCount > 0
  const showOutput = outputLineCount > 0

  return (
    <div className="claude-window">
      <div className="claude-window-topbar">
        <span className="claude-window-pill" />
        <span>Claude Code</span>
        <span className="claude-window-separator" />
        <span>{claudeCopy.path}</span>
        <span className="claude-branch-pill">{claudeCopy.branch}</span>
        <span className="claude-status-pill">{claudeCopy.status}</span>
      </div>
      <div className="claude-terminal">
        {!showPrompt ? (
          <div className="claude-welcome">
            <div className="claude-logo-mark" aria-hidden="true" />
            <strong>{claudeCopy.title}</strong>
            <span>{claudeCopy.subtitle}</span>
          </div>
        ) : (
          <div className="claude-session">
            <div className="claude-session-head">
              <div className="claude-session-meta">
                <span className="claude-session-chip">session</span>
                <strong>{claudeCopy.path}</strong>
              </div>
              <span className="claude-session-model">Opus</span>
            </div>
            <div className="claude-session-panel">
              <div className="claude-session-line">
                <span className="claude-prompt-marker">›</span>
                <p className="claude-prompt-text">
                  {claudePromptWords.slice(0, promptWordCount).map((word, wordIndex) => (
                    <Fragment key={`${word}-${wordIndex}`}>
                      <span className="claude-prompt-word">{word}</span>
                      {wordIndex < promptWordCount - 1 ? ' ' : null}
                    </Fragment>
                  ))}
                </p>
              </div>
              {showOutput ? (
                <>
                  <div className="claude-output-lines">
                    {claudeCopy.output.slice(0, outputLineCount).map((line) => (
                      <div className="claude-output-line" key={line}>
                        <span className="claude-output-bullet" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                  <div className="claude-diff-panel">
                    <div className="claude-diff-head">
                      <span>{claudeCopy.diffTitle}</span>
                      <span>+2</span>
                    </div>
                    <div className="claude-diff-files">
                      {claudeCopy.diffFiles.map((file) => (
                        <div className="claude-diff-file" key={file}>
                          <span className="claude-diff-marker">M</span>
                          <span>{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="claude-session-footer">{claudeCopy.footer}</div>
          </div>
        )}
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
  const [notesFrameIndex, setNotesFrameIndex] = useState(0)
  const [claudePromptWordCount, setClaudePromptWordCount] = useState(0)
  const [claudeOutputLineCount, setClaudeOutputLineCount] = useState(0)
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

  useEffect(() => {
    if (previewScene !== 'notes') {
      return
    }
    if (prefersReducedMotion) {
      setNotesFrameIndex(2)
      return
    }

    setNotesFrameIndex(0)
    const timeouts = [
      window.setTimeout(() => {
        setNotesFrameIndex(1)
      }, NOTES_FRAME_STEP_MS),
      window.setTimeout(() => {
        setNotesFrameIndex(2)
      }, NOTES_FRAME_STEP_MS * 2)
    ]

    return () => {
      for (const timeoutId of timeouts) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [prefersReducedMotion, previewScene])

  useEffect(() => {
    if (previewScene !== 'claude') {
      return
    }

    const claudePromptWords = HERO_PREVIEW_COPY[locale].claude.prompt.split(' ')
    const outputLength = HERO_PREVIEW_COPY[locale].claude.output.length

    if (prefersReducedMotion) {
      setClaudePromptWordCount(claudePromptWords.length)
      setClaudeOutputLineCount(outputLength)
      return
    }

    setClaudePromptWordCount(0)
    setClaudeOutputLineCount(0)

    const timeouts: number[] = []
    timeouts.push(
      window.setTimeout(() => {
        let promptCount = 0
        const promptIntervalId = window.setInterval(() => {
          promptCount += 1
          setClaudePromptWordCount(promptCount)
          if (promptCount >= claudePromptWords.length) {
            window.clearInterval(promptIntervalId)
            let outputCount = 0
            const outputIntervalId = window.setInterval(() => {
              outputCount += 1
              setClaudeOutputLineCount(outputCount)
              if (outputCount >= outputLength) {
                window.clearInterval(outputIntervalId)
              }
            }, CLAUDE_OUTPUT_LINE_MS)
            timeouts.push(outputIntervalId)
          }
        }, CLAUDE_PROMPT_WORD_MS)
        timeouts.push(promptIntervalId)
      }, CLAUDE_WELCOME_HOLD_MS)
    )

    return () => {
      for (const timeoutId of timeouts) {
        window.clearInterval(timeoutId)
        window.clearTimeout(timeoutId)
      }
    }
  }, [locale, prefersReducedMotion, previewScene])

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
              <div className="hero-preview-scene-tabs">
                {PREVIEW_SCENES.map((scene) => (
                  <span
                    className={`hero-preview-scene-tab${scene === previewScene ? ' is-active' : ''}`}
                    key={scene}
                  >
                    {HERO_PREVIEW_COPY[locale].scenes[scene]}
                  </span>
                ))}
              </div>
              <div className="mockup mockup-main">
                {previewScene === 'slack'
                  ? renderSlackPreviewScene(visibleComposerWords)
                  : previewScene === 'notes'
                  ? renderNotesPreviewScene(locale, notesFrameIndex)
                  : renderClaudePreviewScene(locale, claudePromptWordCount, claudeOutputLineCount)}
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
