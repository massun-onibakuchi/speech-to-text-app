/*
 * Where: site/src/content/en.ts
 * What: English landing-page copy for Dicta.
 * Why: Keep the primary locale grounded in shipped product value and concise marketing language.
 */

import type { LandingPageCopy } from './types'

export const enCopy: LandingPageCopy = {
  localeLabel: 'EN',
  localeSwitchLabel: 'Language',
  documentTitle: 'Dicta - The Swiss Army Knife for Speech, Writing and Code',
  documentDescription:
    'Dicta is a macOS speech-to-text app built to capture spoken thoughts and turn them into usable writing fast.',
  documentOgDescription:
    'A macOS speech-to-text app for turning spoken thoughts into clean, ready-to-use text.',
  navFeature: 'Features',
  navWorkflow: 'Usage',
  navDownload: 'Download',
  heroEyebrow: '',
  heroTitleLead: 'The Swiss Army Knife',
  heroTitleBridge: 'for',
  heroTitleRotatingWords: ['Speech', 'Writing', 'Code'],
  heroBody: '',
  heroPrimaryCta: 'Download Dicta',
  heroSecondaryCta: 'View on GitHub',
  heroMetaLabel: 'Product highlights',
  heroMeta: ['macOS desktop app', 'Pay as you go', 'User dictionary'],
  mockupRecording: 'Recording',
  mockupCaption: 'Speak while the thought is still clear.',
  featureIntroEyebrow: 'Features',
  featureIntroTitleLines: ['Speech is messy.', "Your text shouldn't be."],
  featureIntroBody: 'Tools that turn rough speech into clean text fast.',
  features: [
    {
      title: 'High Accuracy',
      body: 'Speech becomes clean text fast enough to keep your train of thought.',
      accent: 'Reliable output'
    },
    {
      title: 'Pay as You Go',
      body: 'Use your own models and scale without lock-in.',
      accent: 'No heavy lock-in'
    },
    {
      title: 'User Dictionary',
      body: 'Names and domain terms stay correct.',
      accent: 'Personalized speech'
    },
    {
      title: 'Profiles',
      body: 'Raw dictation becomes clean, structured text automatically.',
      accent: 'Ready for repeat use'
    }
  ],
  workflowEyebrow: 'Usage',
  workflowTitle: 'Use Dicta in three steps',
  workflowSteps: [
    {
      title: 'Start recording',
      body: 'Press ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: ' to begin capturing audio.'
    },
    {
      title: 'Speak',
      body: 'Say what you want. Dicta transcribes.'
    },
    {
      title: 'Stop recording',
      body: 'Press ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: ' again to finish.'
    }
  ],
  showcaseEyebrow: 'Product view',
  showcaseTitle: 'Three tools for turning speech into usable text',
  showcaseCards: [
    {
      kind: 'transformation',
      eyebrow: 'Run selected profile',
      title: 'Clean up dictation instantly',
      body: 'Turn rough speech into a structured prompt before it’s sent.',
      detail: ''
    },
    {
      kind: 'profile',
      eyebrow: 'Reusable profile',
      title: 'Reusable text profiles',
      body: 'Save formatting rules and transformations for repeat work.',
      detail: ''
    },
    {
      kind: 'dictionary',
      eyebrow: 'User dict',
      title: 'Lock in names and jargon',
      body: 'Keep apps, people, and domain terms correct.',
      detail: ''
    }
  ],
  faqEyebrow: 'FAQ',
  faqTitle: 'FAQ',
  faqItems: [
    {
      question: 'Can I try Dicta for free?',
      answer: 'Yes. Dicta is pay as you go, so you only pay for the usage you actually need.'
    },
    {
      question: 'What platform does Dicta support?',
      answer: 'Dicta is built as a macOS desktop app.'
    },
    {
      question: 'Where do I get it?',
      answer: 'The landing page points directly to the GitHub Releases page for downloads.'
    }
  ],
  finalTitle: 'Talk first. Type less.',
  finalBody: '',
  finalPrimaryCta: 'Download Dicta'
}
