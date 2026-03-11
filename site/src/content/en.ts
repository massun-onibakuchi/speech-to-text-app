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
  heroTitle: 'Speak it. Dicta makes it usable.',
  heroBody:
    'Fast voice capture, clean text, and simple controls for everyday writing.',
  heroPrimaryCta: 'Get Dicta on GitHub Releases',
  heroSecondaryCta: 'View source on GitHub',
  heroMetaLabel: 'Product highlights',
  heroMeta: ['macOS desktop app', 'Pay as you go', 'User dictionary'],
  mockupRecording: 'Recording',
  mockupCaption: 'Speak while the thought is still clear.',
  featureIntroEyebrow: 'Features',
  featureIntroTitle: 'Small details that make Dicta practical.',
  featureIntroBody:
    'Simple on the surface, flexible where it matters.',
  features: [
    {
      title: 'High-Accuracy',
      body: 'Built to turn spoken words into dependable text you can actually use.',
      accent: 'Reliable output'
    },
    {
      title: 'Pay as you go',
      body: 'Use your own provider keys and pay only for what you actually use.',
      accent: 'No heavy lock-in'
    },
    {
      title: 'User Dictionary',
      body: 'Teach Dicta names, terms, and spelling that matter to your work.',
      accent: 'Personalized speech'
    },
    {
      title: 'Profile',
      body: 'Save setups for different tasks and switch without reconfiguring everything.',
      accent: 'Ready for repeat use'
    }
  ],
  workflowEyebrow: 'Usage',
  workflowTitle: 'Use Dicta in this order.',
  workflowSteps: [
    {
      title: 'Toggle recording',
      body: 'Start with one action so Dicta is ready before the thought drifts.'
    },
    {
      title: 'Speak',
      body: 'Say what you mean while Dicta captures it in real time.'
    },
    {
      title: 'Stop recording',
      body: 'End the capture and let Dicta turn it into text you can use right away.'
    }
  ],
  showcaseEyebrow: 'Product view',
  showcaseTitle: 'Made for fast capture and clear output.',
  showcaseCards: [
    {
      eyebrow: 'Capture',
      title: 'Simple recording surface',
      body: 'Big controls and clear states keep the moment focused.',
      detail: 'Start and stop without hesitation.'
    },
    {
      eyebrow: 'Output',
      title: 'Text ready to move',
      body: 'Keep raw text or clean it up before sending it on.',
      detail: 'Clipboard and paste stay explicit.'
    },
    {
      eyebrow: 'Control',
      title: 'Control that stays out of the way',
      body: 'Profiles, shortcuts, and settings help Dicta fit your routine.',
      detail: 'Built for repeat use.'
    }
  ],
  faqEyebrow: 'Details',
  faqTitle: 'Quick answers.',
  faqItems: [
    {
      question: 'What platform does Dicta support?',
      answer: 'Dicta is built as a macOS desktop app.'
    },
    {
      question: 'Where do I get it?',
      answer: 'The landing page points directly to the GitHub Releases page for downloads.'
    },
    {
      question: 'Can I keep raw transcription without extra rewriting?',
      answer: 'Yes. Clean transcription remains first-class, and refinement stays optional.'
    }
  ],
  finalTitle: 'Talk first. Type less.',
  finalBody: 'Dicta helps you capture the thought before it disappears.',
  finalPrimaryCta: 'Download Dicta'
}
