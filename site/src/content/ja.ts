/*
 * Where: site/src/content/ja.ts
 * What: Japanese landing-page copy for Dicta.
 * Why: Provide a natural alternate locale without relying on literal English phrasing.
 */

import type { LandingPageCopy } from './types'

export const jaCopy: LandingPageCopy = {
  localeLabel: 'JA',
  localeSwitchLabel: '言語',
  documentTitle: 'Dicta - The Swiss Army Knife for Speech, Writing and Code',
  documentDescription: 'Dictaは、話した内容をすばやく使える文章へ変えるmacOS向け音声入力アプリです。',
  documentOgDescription:
    '思考が消える前に、macOS上で話した内容をそのまま文章化できる音声入力アプリです。',
  navFeature: '特徴',
  navWorkflow: '使い方',
  navDownload: 'ダウンロード',
  heroEyebrow: '',
  heroTitleLead: '使える万能ツール',
  heroTitleBridge: 'for',
  heroTitleRotatingWords: ['音声', '文章', 'コード'],
  heroSubtitle: 'macOS向け音声入力',
  heroBody: '',
  heroPrimaryCta: 'ダウンロード',
  heroSecondaryCta: 'ソースコードを見る',
  heroMetaLabel: '製品ハイライト',
  heroMeta: ['macOSデスクトップアプリ', '従量課金', 'ユーザー辞書対応'],
  mockupRecording: '録音中',
  mockupCaption: '考えが鮮明なうちに、声をそのまま文章化する。',
  featureIntroEyebrow: '特徴',
  featureIntroTitleLines: ['話すときはラフでいい。', '文字はそのまま使える形に。'],
  featureIntroBody:
    '話し言葉をすばやく実務で使える文章へ整えるための機能をそろえています。',
  features: [
    {
      title: '高精度',
      body: '話す勢いを止めずに、口語表現をそのまま実務で使える文章に整えます。',
      accent: '安定した出力'
    },
    {
      title: '使った分だけ',
      body: '必要な分だけ支払い、個人メモからチーム運用まで無理なく拡張できます。',
      accent: 'ロックインなし'
    },
    {
      title: 'ユーザー辞書',
      body: '固有名詞や専門用語の崩れを抑え、文脈に沿って自然な出力を維持します。',
      accent: '自分向けに最適化'
    },
    {
      title: 'プロファイル',
      body: '会議・要約・下書きごとに最適な状態で開始できるため、毎回の再調整が不要です。',
      accent: '繰り返し使いやすい'
    }
  ],
  workflowEyebrow: '使い方',
  workflowTitle: 'たった3ステップ',
  workflowSteps: [
    {
      title: '録音を開始',
      body: 'トリガー ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: '（標準）を押すと、すぐ録音を始められます。'
    },
    {
      title: '話す',
      body: 'そのまま自然に話して、内容をDictaに渡します。'
    },
    {
      title: '録音を停止',
      body: 'トリガー ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: '（標準）をもう一度押すと、録音を止めて文字起こしを確定します。'
    }
  ],
  showcaseEyebrow: 'プロダクト',
  showcaseTitle: '３つの機能で効率化',
  showcaseCards: [
    {
      kind: 'transformation',
      eyebrow: '選択中のプロファイルを実行',
      title: '口述をそのまま整形済みプロンプトへ変換',
      body: '選択中のプロファイルを適用すると、崩れた指示が送信前に整理されたプロンプトへ変換されます。',
      detail: ''
    },
    {
      kind: 'profile',
      eyebrow: '再利用できるプロファイル',
      title: '繰り返す作業も、最初から正しい設定で開始',
      body: 'メール向け出力、プロンプト方針、翻訳設定をまとめて保存できるため、同じ調整を毎回やり直す必要がありません。',
      detail: ''
    },
    {
      kind: 'dictionary',
      eyebrow: 'ユーザー辞書',
      title: '固有名詞や専門語を毎回同じ精度で通す',
      body: '辞書ビューにアプリ名、人名、業界用語を保存しておくと、セッションを跨いでも重要語彙がぶれにくくなります。',
      detail: ''
    }
  ],
  faqEyebrow: 'FAQ',
  faqTitle: 'FAQ',
  faqItems: [
    {
      question: '無料で試せますか？',
      answer: 'はい。Dictaは従量課金なので、実際に使った分だけ支払えば大丈夫です。'
    },
    {
      question: '対応プラットフォームは？',
      answer: 'DictaはmacOS向けのデスクトップアプリです。'
    },
    {
      question: 'どこから入手できますか？',
      answer: 'このページの CTA から GitHub Releases へ移動できます。'
    }
  ],
  finalTitle: 'まず話す。入力はあとから。',
  finalBody: '',
  finalPrimaryCta: 'Dictaをダウンロード'
}
