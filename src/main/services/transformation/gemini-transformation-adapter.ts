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

const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash'

export class GeminiTransformationAdapter implements TransformationAdapter {
  async transform(input: TransformationInput): Promise<TransformationResult> {
    const promptBlocks = buildPromptBlocks({
      sourceText: input.text,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt
    })

    const requestModel = async (model: string): Promise<Response> =>
      fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
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

    const response = await requestModel(input.model)
    if (!response.ok && response.status === 404 && input.model !== GEMINI_MODEL_FALLBACK) {
      const fallback = await requestModel(GEMINI_MODEL_FALLBACK)
      if (fallback.ok) {
        const data = (await fallback.json()) as GeminiResponse
        const transformedText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        return {
          text: transformedText,
          model: input.model
        }
      }
      throw new Error(`Gemini transformation failed with status ${fallback.status}`)
    }

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
