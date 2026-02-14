const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim()

export const toHistoryPreview = (text: string | null, maxLength = 88): string => {
  if (!text) {
    return '(none)'
  }

  const normalized = collapseWhitespace(text)
  if (!normalized) {
    return '(none)'
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}
