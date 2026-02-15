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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${input.model}:generateContent`,
      {
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
      }
    )

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
