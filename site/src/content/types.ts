/*
 * Where: site/src/content/types.ts
 * What: Shared content types for the Dicta landing page locales.
 * Why: Keep English and Japanese content in a consistent shape without runtime guessing.
 */

export type Locale = 'en' | 'ja'

export interface FeatureCardCopy {
  title: string
  body: string
  accent: string
}

export interface ShowcaseCardCopy {
  kind: 'transformation' | 'profile' | 'dictionary'
  eyebrow: string
  title: string
  body: string
  detail: string
}

export interface FaqItemCopy {
  question: string
  answer: string
}

export interface WorkflowStepCopy {
  title: string
  body: string
  shortcutText?: string
  bodySuffix?: string
}

export interface LandingPageCopy {
  localeLabel: string
  localeSwitchLabel: string
  documentTitle: string
  documentDescription: string
  documentOgDescription: string
  navFeature: string
  navWorkflow: string
  navDownload: string
  heroEyebrow: string
  heroTitleLead: string
  heroTitleBridge: string
  heroTitleRotatingWords: string[]
  heroSubtitle: string
  heroBody: string
  heroPrimaryCta: string
  heroSecondaryCta: string
  heroMetaLabel: string
  heroMeta: string[]
  mockupRecording: string
  mockupCaption: string
  featureIntroEyebrow: string
  featureIntroTitleLines: [string, string]
  featureIntroBody: string
  features: FeatureCardCopy[]
  workflowEyebrow: string
  workflowTitle: string
  workflowSteps: WorkflowStepCopy[]
  showcaseEyebrow: string
  showcaseTitle: string
  showcaseCards: ShowcaseCardCopy[]
  faqEyebrow: string
  faqTitle: string
  faqItems: FaqItemCopy[]
  finalTitle: string
  finalBody: string
  finalPrimaryCta: string
}
