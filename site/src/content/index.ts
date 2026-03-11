/*
 * Where: site/src/content/index.ts
 * What: Locale map for Dicta landing-page copy.
 * Why: Centralize locale lookup and keep rendering logic simple.
 */

import { enCopy } from './en'
import { jaCopy } from './ja'
import type { LandingPageCopy, Locale } from './types'

export const copyByLocale: Record<Locale, LandingPageCopy> = {
  en: enCopy,
  ja: jaCopy
}

export type { LandingPageCopy, Locale } from './types'
