/*
 * Where: site/src/content/en.ts
 * What: English landing-page copy for Dicta.
 * Why: Keep the primary locale grounded in shipped product value and concise marketing language.
 */

import type { LandingPageCopy } from './types'

export const enCopy: LandingPageCopy = {
  localeLabel: 'EN',
  localeSwitchLabel: 'Language',
  documentTitle: 'Dicta',
  documentDescription:
    'Dicta is a macOS speech-to-text app built to capture spoken thoughts and turn them into usable writing fast.',
  documentOgDescription:
    'A macOS speech-to-text app for turning spoken thoughts into clean, ready-to-use text.',
  navFeature: 'Features',
  navWorkflow: 'Usage',
  navDownload: 'Download',
  heroEyebrow: 'macOS speech-to-text for real work',
  heroTitleLead: 'The Swiss Army Knife for',
  heroTitleRotatingWords: ['Work', 'Speech', 'Text'],
  heroBody:
    'Fast voice capture, clean text, and simple controls for everyday writing.',
  heroPrimaryCta: 'Get Dicta on GitHub Releases',
  heroSecondaryCta: 'View source on GitHub',
  heroMetaLabel: 'Product highlights',
  heroMeta: ['macOS desktop app', 'Pay as you go', 'User dictionary'],
  mockupRecording: 'Recording',
  mockupCaption: 'Speak while the thought is still clear.',
  featureIntroEyebrow: 'Features',
  featureIntroTitle: 'Built for the messy reality of spoken work.',
  featureIntroBody:
    'Each feature is tuned to keep rough speech moving toward shippable text.',
  features: [
    {
      title: 'High-Accuracy',
      body: 'Raw speech lands as clean copy fast enough to stay inside the same train of thought.',
      accent: 'Reliable output'
    },
    {
      title: 'Pay as you go',
      body: 'Bring your own model budget and scale from personal notes to team throughput without lock-in.',
      accent: 'No heavy lock-in'
    },
    {
      title: 'User Dictionary',
      body: 'Project names, people, and domain terms stay correct because the product learns your language.',
      accent: 'Personalized speech'
    },
    {
      title: 'Profile',
      body: 'Capture presets let meetings, briefs, and drafting sessions start in the right mode immediately.',
      accent: 'Ready for repeat use'
    }
  ],
  workflowEyebrow: 'Usage',
  workflowTitle: 'Use Dicta in this order.',
  workflowSteps: [
    {
      title: 'Toggle recording',
      body: 'Trigger ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: ' (default) to start capture the moment you are ready.'
    },
    {
      title: 'Speak',
      body: 'Say what you mean while Dicta captures it in real time.'
    },
    {
      title: 'Stop recording',
      body: 'Trigger ',
      shortcutText: '⌘ + Option + T',
      bodySuffix: ' (default) again to stop and send the capture forward.'
    }
  ],
  showcaseEyebrow: 'Product view',
  showcaseTitle: 'Three views that make Dicta feel immediate and reusable.',
  showcaseCards: [
    {
      kind: 'transformation',
      eyebrow: 'Run selected profile',
      title: 'Turn a messy instruction into a clean prompt in one move',
      body: 'Run the selected profile shortcut and watch rough intent tighten into a structured prompt before it gets sent.',
      detail: 'A fast transformation view makes the before and after obvious.'
    },
    {
      kind: 'profile',
      eyebrow: 'Reusable profile',
      title: 'Keep the right setup ready for repeat work',
      body: 'A persistent profile bundles email mode, prompt rules, and translation behavior so recurring tasks start in the right shape.',
      detail: 'Email, Prompt, and Translation live in one reusable view.'
    },
    {
      kind: 'dictionary',
      eyebrow: 'Custom dictionary',
      title: 'Lock in names, jargon, and product language',
      body: 'The dictionary view gives your app, people, and domain terms a permanent place so transcripts stop drifting on the words that matter.',
      detail: 'Correct once, then keep reusing the same vocabulary.'
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
  finalBody: 'Dicta helps you capture the thought before it disappears.',
  finalPrimaryCta: 'Download Dicta'
}
