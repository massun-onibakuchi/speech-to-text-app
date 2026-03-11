/*
 * Where: site/src/content/ja.ts
 * What: Japanese landing-page copy for Dicta.
 * Why: Provide a natural alternate locale without relying on literal English phrasing.
 */

import type { LandingPageCopy } from './types'

export const jaCopy: LandingPageCopy = {
  localeLabel: 'JA',
  localeSwitchLabel: '言語',
  documentTitle: 'Dicta',
  documentDescription: 'Dictaは、話した内容をすばやく使える文章へ変えるmacOS向け音声入力アプリです。',
  documentOgDescription: 'macOSで、思考が消える前に声を使って文章へ変えるための音声入力アプリ。',
  navFeature: '特徴',
  navWorkflow: '使い方',
  navDownload: 'ダウンロード',
  heroEyebrow: 'macOSのための、実用的な音声入力',
  heroTitle: 'Dictaは、消える前のアイデアを、すぐ使える文章に変える音声入力アプリです。',
  heroBody:
    '思いつきを声で残し、必要なら整えて、そのまま次の作業へ。Dictaは、速さと扱いやすさを重視したmacOSデスクトップアプリです。',
  heroPrimaryCta: 'GitHub Releasesから入手',
  heroSecondaryCta: 'GitHubでソースを見る',
  heroMetaLabel: 'プロダクトの特長',
  heroMeta: ['macOSデスクトップアプリ', 'クリップボードまたは貼り付け出力', '文章の整形は必要なときだけ'],
  mockupRecording: '録音中',
  mockupCaption: '考えが鮮明なうちに、そのまま声で残す。',
  featureIntroEyebrow: '3つの魅力',
  featureIntroTitle: 'タイピングより先に、考えを逃さないために。',
  featureIntroBody:
    'Dictaは、ただ文字起こしするだけのツールではありません。浮かんだ考えをすばやく掴み、そのまま使える形に整えるための実用的なアプリです。',
  features: [
    {
      title: '話したら、すぐ使えるテキストへ。',
      body:
        '声にした内容をすばやくテキスト化し、クリップボードや貼り付け出力ですぐ次の作業につなげられます。',
      accent: 'すばやい入力'
    },
    {
      title: '話し言葉を、読みやすい文章へ。',
      body:
        '音声の内容をそのまま活かしつつ、必要なときだけメモや下書きとして読みやすい形へ整えられます。',
      accent: '整った文章'
    },
    {
      title: '毎日使うための操作性。',
      body:
        'ショートカット、プロファイル、音声入力設定、辞書サポートにより、繰り返し使うほど扱いやすくなります。',
      accent: '日常の道具'
    }
  ],
  workflowEyebrow: '使い方',
  workflowTitle: '声から文章まで、流れは短く。',
  workflowSteps: [
    {
      title: '話す',
      body: 'すぐに録音を始めて、タイピングより先に思考を残します。'
    },
    {
      title: 'テキスト化する',
      body: '対応プロバイダーを通じて音声をテキスト化し、体験はデスクトップらしく軽快に保ちます。'
    },
    {
      title: '貼り付ける、または整える',
      body: 'そのまま使うことも、必要に応じて読みやすく整えてから使うこともできます。'
    }
  ],
  showcaseEyebrow: 'プロダクト',
  showcaseTitle: '録音、出力、操作性を中心に設計。',
  showcaseCards: [
    {
      eyebrow: '録音',
      title: '迷わず使える録音画面',
      body: '大きな録音操作、状態の強調、波形フィードバックで、今どの状態かがすぐ分かります。',
      detail: '開始も停止もワンアクション。'
    },
    {
      eyebrow: '出力',
      title: '使える形で次へ渡せる',
      body: 'テキスト化した内容をそのまま使うことも、整えてから次のアプリへ渡すこともできます。',
      detail: 'クリップボードと貼り付けを明示的に制御。'
    },
    {
      eyebrow: '操作',
      title: '毎日の利用に耐える設計',
      body: 'ショートカット、プロファイル、音声設定、辞書サポートで、使うほど手になじみます。',
      detail: '派手さより実用性を優先。'
    }
  ],
  faqEyebrow: '詳細',
  faqTitle: 'Dictaでできること。',
  faqItems: [
    {
      question: '対応プラットフォームは？',
      answer: 'DictaはmacOS向けのデスクトップアプリです。'
    },
    {
      question: 'どこから入手できますか？',
      answer: 'このページのCTAからGitHub Releasesへ移動できます。'
    },
    {
      question: '整形せずに文字起こし結果だけ使えますか？',
      answer: 'はい。文字起こし結果はそのまま使え、整形は必要なときだけ行えます。'
    }
  ],
  finalTitle: '思考がはっきりしているうちに、言葉にする。',
  finalBody: 'Dictaは、声で入力し、使える文章にし、その勢いのまま次の作業へ進むためのアプリです。',
  finalPrimaryCta: 'Dictaをダウンロード'
}
