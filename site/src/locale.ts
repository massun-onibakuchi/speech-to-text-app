/*
 * Where: site/src/locale.ts
 * What: Locale resolution and persistence helpers for the Dicta landing page.
 * Why: Keep browser-language detection and manual preference handling deterministic on GitHub Pages.
 */

import type { Locale } from './content'

export const LOCALE_STORAGE_KEY = 'dicta_lp_locale'

const normalizeLocale = (candidate: string | null | undefined): Locale | null => {
  if (!candidate) {
    return null
  }
  return candidate.toLowerCase().startsWith('ja') ? 'ja' : candidate.toLowerCase().startsWith('en') ? 'en' : null
}

export const resolveInitialLocale = (): Locale => {
  const stored = normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  if (stored) {
    return stored
  }
  const browserLocale = normalizeLocale(window.navigator.language)
  return browserLocale ?? 'en'
}

export const persistLocale = (locale: Locale): void => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
}
