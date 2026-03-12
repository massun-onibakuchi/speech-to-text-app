/*
 * Where: site/src/showcase-illustrations.tsx
 * What: Product-view illustration data and renderers for the landing page showcase cards.
 * Why: Keep large static marketing mockups separate from the page shell so App focuses on composition and state.
 */

import type { Locale } from './content'

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

export const renderShowcaseIllustration = (
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
