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
  heroEyebrow: 'macOSのための音声入力',
  heroTitleLead: '話し仕事の',
  heroTitleRotatingWords: ['定番ツール', '音声入力', '文章化'],
  heroBody:
    '速く録って、きれいに残す。毎日使いやすいシンプルな音声入力アプリです。',
  heroPrimaryCta: 'GitHub Releasesから入手',
  heroSecondaryCta: 'GitHubでソースを見る',
  heroMetaLabel: 'プロダクトの特長',
  heroMeta: ['macOSデスクトップアプリ', '従量課金で使える', 'ユーザー辞書対応'],
  mockupRecording: '録音中',
  mockupCaption: '考えが鮮明なうちに、そのまま声で残す。',
  featureIntroEyebrow: '特徴',
  featureIntroTitle: '話し言葉の現場に合わせて設計。',
  featureIntroBody:
    '雑な音声入力を、そのまま使える文章へ寄せるための機能を揃えています。',
  features: [
    {
      title: '高精度',
      body: '思考の勢いを止めずに、話し言葉をそのまま実務で使える文へ整えます。',
      accent: '安定した出力'
    },
    {
      title: '使った分だけ',
      body: '自分のモデル予算で回せるので、個人メモからチーム運用まで無理なく広げられます。',
      accent: '重い契約なし'
    },
    {
      title: 'ユーザー辞書',
      body: '固有名詞や専門用語が崩れにくくなり、あなたの文脈でそのまま通る出力になります。',
      accent: '自分向けに最適化'
    },
    {
      title: 'プロファイル',
      body: '会議、要約、下書きごとに最適な状態から始められるので、毎回の調整が要りません。',
      accent: '繰り返し使いやすい'
    }
  ],
  workflowEyebrow: '使い方',
  workflowTitle: 'この順番で使います。',
  workflowSteps: [
    {
      title: '録音を切り替える',
      body: 'トリガー ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: '（標準）で、準備ができた瞬間に録音を始められます。'
    },
    {
      title: '話す',
      body: 'そのまま自然に話して、内容をDictaに渡します。'
    },
    {
      title: '録音を止める',
      body: 'トリガー ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: '（標準）をもう一度押すと、録音を止めて次へ渡せます。'
    }
  ],
  showcaseEyebrow: 'プロダクト',
  showcaseTitle: 'すぐ使えて、繰り返し効く3つのビュー。',
  showcaseCards: [
    {
      kind: 'transformation',
      eyebrow: '選択中プロファイルを実行',
      title: '雑な指示を、そのまま整ったプロンプトへ変える',
      body: '選択中プロファイルのショートカットを押すと、崩れた指示が送信前に整理されたプロンプトへ変わる流れを見せます。',
      detail: '変換前と変換後がひと目で分かるビューです。'
    },
    {
      kind: 'profile',
      eyebrow: '再利用できるプロファイル',
      title: '何度使う作業でも、最初から正しい設定で始める',
      body: 'メール向けの出力、プロンプト方針、翻訳設定をまとめて保存できるので、繰り返し作業を毎回組み直す必要がありません。',
      detail: 'Email、Prompt、Translation をひとつのビューで保持します。'
    },
    {
      kind: 'dictionary',
      eyebrow: 'カスタム辞書',
      title: '固有名詞や専門語を、毎回崩さず通す',
      body: '辞書ビューにアプリ名、人名、業界用語を置いておけば、大事な語彙がセッションをまたいでもぶれにくくなります。',
      detail: '一度直した語彙を、そのまま使い回せます。'
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
      answer: 'このページのCTAからGitHub Releasesへ移動できます。'
    }
  ],
  finalTitle: 'まず話す。入力はあとで。',
  finalBody: 'Dictaは、消える前の考えをすばやく残すためのアプリです。',
  finalPrimaryCta: 'Dictaをダウンロード'
}
