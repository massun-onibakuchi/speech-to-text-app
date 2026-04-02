/*
Where: src/main/services/transformation/openai-subscription-transformation-adapter.ts
What: ChatGPT-subscription transformation adapter that speaks the Codex-style responses endpoint.
Why: Subscription-backed OAuth does not use the normal Platform API key path, so execution needs
     its own provider adapter with bearer-token and account-header support.
*/

import { buildPromptBlocks } from './prompt-format'
import type { TransformationAdapter, TransformationInput, TransformationResult } from './types'

const OPENAI_SUBSCRIPTION_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'

interface OpenAiSubscriptionResponse {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

export class OpenAiSubscriptionTransformationAdapter implements TransformationAdapter {
  async transform(input: TransformationInput): Promise<TransformationResult> {
    if (input.credential.kind !== 'oauth') {
      throw new Error('OpenAI subscription transformation requires OAuth credentials.')
    }

    const response = await fetch(OPENAI_SUBSCRIPTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.credential.accessToken}`,
        ...(input.credential.accountId ? { 'ChatGPT-Account-Id': input.credential.accountId } : {}),
        originator: 'dicta',
        'User-Agent': 'dicta/electron'
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.prompt.systemPrompt.trim().length > 0 ? input.prompt.systemPrompt.trim() : undefined,
        input: buildPromptBlocks({
          sourceText: input.text,
          userPrompt: input.prompt.userPrompt
        }).join('\n\n')
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI subscription transformation failed with status ${response.status}`)
    }

    const data = (await response.json()) as OpenAiSubscriptionResponse
    const text =
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text ?? '')
        .join('') ??
      ''

    return {
      text,
      provider: 'openai-subscription',
      model: input.model
    }
  }
}
