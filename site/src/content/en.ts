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
  navWorkflow: 'Workflow',
  navDownload: 'Download',
  heroEyebrow: 'macOS speech-to-text, sharpened for real work',
  heroTitle: 'Dicta turns speech into polished text before your train of thought disappears.',
  heroBody:
    'Capture spoken ideas, clean them up, and send them straight into your workflow with a desktop app built for speed, control, and repeat daily use.',
  heroPrimaryCta: 'Get Dicta on GitHub Releases',
  heroSecondaryCta: 'View source on GitHub',
  heroMetaLabel: 'Product highlights',
  heroMeta: ['macOS desktop app', 'Clipboard or paste output', 'Optional AI refinement'],
  mockupRecording: 'Recording',
  mockupCaption: 'Speak while the thought is still clear.',
  featureIntroEyebrow: 'Three remarkable features',
  featureIntroTitle: 'Built for moments when typing is already too slow.',
  featureIntroBody:
    'Dicta is not a generic transcription toy. It is designed to catch fleeting thoughts, make them usable, and stay out of the way once the text is ready.',
  features: [
    {
      title: 'Speak once. Get usable text.',
      body:
        'Record quickly and turn spoken thoughts into clean text that is ready for clipboard or immediate paste output.',
      accent: 'Fast capture'
    },
    {
      title: 'Refine raw speech into polished writing.',
      body:
        'Keep transcription first-class, then optionally transform rough speech into clearer notes, messages, or drafts when you need a cleaner finish.',
      accent: 'Cleaner output'
    },
    {
      title: 'Set it up once, use it every day.',
      body:
        'Profiles, shortcuts, audio input controls, and dictionary support make Dicta feel like a dependable tool instead of a fragile demo.',
      accent: 'Daily workflow'
    }
  ],
  workflowEyebrow: 'How it works',
  workflowTitle: 'A short path from voice to finished text.',
  workflowSteps: [
    {
      title: 'Speak',
      body: 'Start recording fast, capture the thought, and keep your hands free when typing would slow you down.'
    },
    {
      title: 'Transcribe',
      body: 'Convert speech into text through supported providers while keeping the experience focused and desktop-native.'
    },
    {
      title: 'Paste or refine',
      body: 'Send the result to clipboard or paste output immediately, then apply optional cleanup when the wording needs more polish.'
    }
  ],
  showcaseEyebrow: 'Product view',
  showcaseTitle: 'Designed around recording, output, and control.',
  showcaseCards: [
    {
      eyebrow: 'Capture',
      title: 'A recording surface that feels immediate',
      body: 'Large record control, live state emphasis, and waveform-driven feedback keep the capture moment obvious.',
      detail: 'Single-action start and stop. No clutter.'
    },
    {
      eyebrow: 'Output',
      title: 'Text that is ready to move',
      body: 'Keep raw transcription first-class or polish it before sending it straight into the next app.',
      detail: 'Clipboard and paste workflows stay explicit.'
    },
    {
      eyebrow: 'Control',
      title: 'Built to hold up in daily use',
      body: 'Shortcuts, profiles, audio settings, and dictionary support make repeated use faster instead of messier.',
      detail: 'Practical controls, not feature theater.'
    }
  ],
  faqEyebrow: 'Details',
  faqTitle: 'What Dicta is built for.',
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
  finalTitle: 'Capture the thought while it is still clear.',
  finalBody: 'Dicta is built for fast spoken input, usable text, and a workflow that does not break your momentum.',
  finalPrimaryCta: 'Download Dicta'
}
