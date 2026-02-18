import type { TransformationAdapter, TransformationInput, TransformationResult } from './types'
import { buildPromptBlocks } from './prompt-format'

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

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'

const resolveGeminiGenerateContentEndpoint = (model: string, baseUrlOverride?: string | null): string => {
  const baseUrl =
    baseUrlOverride && baseUrlOverride.trim().length > 0
      ? baseUrlOverride.replace(/\/+$/u, '')
      : GEMINI_DEFAULT_BASE_URL

  // Google Gemini REST API: POST /v1beta/models/{model}:generateContent
  return `${baseUrl}/v1beta/models/${model}:generateContent`
}
