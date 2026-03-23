// Where: src/main/orchestrators/output-failure-formatting.ts
// What:  Shared helpers for normalizing output-stage failure messages.
// Why:   Keep capture and transform pipelines aligned when formatting output
//        failure details so message drift does not create inconsistent UX.

export function normalizeOutputFailureDetail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeOutputThrownFailureDetail(error: unknown): string {
  if (error instanceof Error) {
    const detail = normalizeOutputFailureDetail(error.message)
    if (detail) {
      return detail
    }
  }

  return 'Output application failed.'
}

export function formatTransformOutputFailureMessage(raw: string | null | undefined): string {
  const detail = normalizeOutputFailureDetail(raw)
  return detail
    ? `Transformation succeeded but output application partially failed. ${detail}`
    : 'Transformation succeeded but output application partially failed.'
}
