import { INPUT_PLACEHOLDER, validateSafeUserPromptTemplate } from '../../../shared/prompt-template-safety'
export { INPUT_PLACEHOLDER }

export interface PromptFormatInput {
  sourceText: string
  userPrompt: string
}

const applyUserPromptTemplate = (sourceText: string, userPrompt: string): string => {
  const trimmedUserPrompt = userPrompt.trim()
  const safetyError = validateSafeUserPromptTemplate(trimmedUserPrompt)
  if (safetyError) {
    throw new Error(`Unsafe user prompt template: ${safetyError}`)
  }

  return trimmedUserPrompt.replace(INPUT_PLACEHOLDER, escapeXmlText(sourceText))
}

const escapeXmlText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

export const buildPromptBlocks = (input: PromptFormatInput): string[] => {
  return [applyUserPromptTemplate(input.sourceText, input.userPrompt)]
}
