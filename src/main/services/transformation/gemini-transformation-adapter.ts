import type { TransformationAdapter, TransformationInput, TransformationResult } from './types'
import { buildPromptBlocks } from './prompt-format'
import { resolveProviderEndpoint } from '../endpoint-resolver'

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

export class GeminiTransformationAdapter implements TransformationAdapter {
  async transform(input: TransformationInput): Promise<TransformationResult> {
    const promptBlocks = buildPromptBlocks({
      sourceText: input.text,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt
    })

    const endpoint = resolveGeminiGenerateContentEndpoint(input.model, input.baseUrlOverride)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: promptBlocks.map((text) => ({ text }))
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`Gemini transformation failed with status ${response.status}`)
    }

    const data = (await response.json()) as GeminiResponse
    const transformedText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return {
      text: transformedText,
      model: input.model
    }
  }
}

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com'
const GEMINI_GENERATE_PATH = '/v1beta/models/{model}:generateContent'

const resolveGeminiGenerateContentEndpoint = (model: string, baseUrlOverride?: string | null): string =>
  resolveProviderEndpoint(GEMINI_DEFAULT_BASE, GEMINI_GENERATE_PATH, baseUrlOverride, { model })
