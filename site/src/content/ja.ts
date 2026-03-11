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
  heroTitle: '話すだけで、使える文章へ。',
  heroBody:
    '速く録って、きれいに残す。毎日使いやすいシンプルな音声入力アプリです。',
  heroPrimaryCta: 'GitHub Releasesから入手',
  heroSecondaryCta: 'GitHubでソースを見る',
  heroMetaLabel: 'プロダクトの特長',
  heroMeta: ['macOSデスクトップアプリ', '従量課金で使える', 'ユーザー辞書対応'],
  mockupRecording: '録音中',
  mockupCaption: '考えが鮮明なうちに、そのまま声で残す。',
  featureIntroEyebrow: '特徴',
  featureIntroTitle: '小さな違いが、使いやすさになる。',
  featureIntroBody:
    '見た目はシンプルでも、実用性はしっかりしています。',
  features: [
    {
      title: '高精度',
      body: '話した内容を、信頼して使えるテキストへ変えます。',
      accent: '安定した出力'
    },
    {
      title: '使った分だけ',
      body: '自分のプロバイダーキーを使うので、必要な分だけ支払えます。',
      accent: '重い契約なし'
    },
    {
      title: 'ユーザー辞書',
      body: '固有名詞や専門用語を覚えさせて、自分の言葉に合わせられます。',
      accent: '自分向けに最適化'
    },
    {
      title: 'プロファイル',
      body: '用途ごとの設定を保存して、切り替えもすばやく行えます。',
      accent: '繰り返し使いやすい'
    }
  ],
  workflowEyebrow: '使い方',
  workflowTitle: 'この順番で使います。',
  workflowSteps: [
    {
      title: '録音を切り替える',
      body: 'まず録音を開始して、話す準備を整えます。'
    },
    {
      title: '話す',
      body: 'そのまま自然に話して、内容をDictaに渡します。'
    },
    {
      title: '録音を止める',
      body: '録音を終えると、すぐ使えるテキストへ変わります。'
    }
  ],
  showcaseEyebrow: 'プロダクト',
  showcaseTitle: '速く録って、見やすく出す。',
  showcaseCards: [
    {
      eyebrow: '録音',
      title: '迷わない録音画面',
      body: '大きな操作と明確な状態表示で、すぐ使えます。',
      detail: '開始も停止もワンアクション。'
    },
    {
      eyebrow: '出力',
      title: 'そのまま次へ渡せる',
      body: 'テキスト化した内容を、すぐ使える形で出せます。',
      detail: 'クリップボードと貼り付けを明示的に制御。'
    },
    {
      eyebrow: '操作',
      title: '毎日使いやすい操作性',
      body: 'プロファイルやショートカットで、繰り返しの作業が軽くなります。',
      detail: '派手さより実用性。'
    }
  ],
  faqEyebrow: '詳細',
  faqTitle: 'よくある確認。',
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
  finalTitle: 'まず話す。入力はあとで。',
  finalBody: 'Dictaは、消える前の考えをすばやく残すためのアプリです。',
  finalPrimaryCta: 'Dictaをダウンロード'
}
