export interface PromptFormatInput {
  sourceText: string
  systemPrompt: string
  userPrompt: string
}

export const INPUT_PLACEHOLDER = '{{input}}'

const applyUserPromptTemplate = (sourceText: string, userPrompt: string): string => {
  const trimmedUserPrompt = userPrompt.trim()
  if (!trimmedUserPrompt) {
    return sourceText
  }

  if (trimmedUserPrompt.includes(INPUT_PLACEHOLDER)) {
    return trimmedUserPrompt.replaceAll(INPUT_PLACEHOLDER, sourceText)
  }

  return `${trimmedUserPrompt}\n\n${sourceText}`
}

export const buildPromptBlocks = (input: PromptFormatInput): string[] => {
  const blocks: string[] = []
  const trimmedSystemPrompt = input.systemPrompt.trim()

  if (trimmedSystemPrompt) {
    blocks.push(`System Prompt:\n${trimmedSystemPrompt}`)
  }

  blocks.push(applyUserPromptTemplate(input.sourceText, input.userPrompt))
  return blocks
}
