/*
Where: src/main/services/transformation/openai-subscription-transformation-adapter.ts
What: ChatGPT-subscription transformation adapter that executes prompts through Codex CLI.
Why: ChatGPT-plan sign-in lives in Codex CLI, so subscription execution must shell out through the
     supported CLI boundary instead of storing browser OAuth credentials in Dicta.
*/

import type { CodexCliService } from '../codex-cli-service'
import { buildPromptBlocks } from './prompt-format'
import type { TransformationAdapter, TransformationInput, TransformationResult } from './types'

export class OpenAiSubscriptionTransformationAdapter implements TransformationAdapter {
  private readonly codexCliService: Pick<CodexCliService, 'runTransformation'>

  constructor(deps: { codexCliService: Pick<CodexCliService, 'runTransformation'> }) {
    this.codexCliService = deps.codexCliService
  }

  async transform(input: TransformationInput): Promise<TransformationResult> {
    if (input.credential.kind !== 'cli') {
      throw new Error('OpenAI subscription transformation requires Codex CLI readiness.')
    }

    if (input.model !== 'gpt-5.4-mini') {
      throw new Error('OpenAI subscription transformation only supports gpt-5.4-mini.')
    }

    const text = await this.codexCliService.runTransformation({
      model: input.model,
      prompt: buildCodexTransformationPrompt(input)
    })

    return {
      text,
      provider: 'openai-subscription',
      model: input.model
    }
  }
}

const buildCodexTransformationPrompt = (input: TransformationInput): string => {
  const sections = [
    'You are transforming dictated text for a desktop app.',
    'Follow the system instructions and user instructions exactly.',
    'Return only the transformed text.',
    'Do not add markdown, quotes, explanations, or surrounding commentary.'
  ]

  const systemPrompt = input.prompt.systemPrompt.trim()
  if (systemPrompt.length > 0) {
    sections.push('', '<system_instructions>', systemPrompt, '</system_instructions>')
  }

  sections.push(
    '',
    '<user_instructions>',
    buildPromptBlocks({
      sourceText: input.text,
      userPrompt: input.prompt.userPrompt
    }).join('\n\n'),
    '</user_instructions>'
  )

  return sections.join('\n')
}
