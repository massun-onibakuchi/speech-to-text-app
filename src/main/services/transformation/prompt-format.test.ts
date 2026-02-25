import { describe, expect, it } from 'vitest'
import { buildPromptBlocks, INPUT_PLACEHOLDER, LEGACY_INPUT_PLACEHOLDER } from './prompt-format'

describe('buildPromptBlocks', () => {
  it('builds system+user prompt blocks with input placeholder replacement', () => {
    const blocks = buildPromptBlocks({
      sourceText: 'raw input',
      systemPrompt: 'You are an editor.',
      userPrompt: `Please rewrite: ${INPUT_PLACEHOLDER}`
    })

    expect(blocks).toEqual(['System Prompt:\nYou are an editor.', 'Please rewrite: raw input'])
  })

  it('falls back to source text when user prompt is empty', () => {
    const blocks = buildPromptBlocks({
      sourceText: 'raw input',
      systemPrompt: '',
      userPrompt: '   '
    })

    expect(blocks).toEqual(['raw input'])
  })

  it('supports legacy {{input}} placeholder for backward compatibility', () => {
    const blocks = buildPromptBlocks({
      sourceText: 'raw input',
      systemPrompt: '',
      userPrompt: `Legacy template: ${LEGACY_INPUT_PLACEHOLDER}`
    })

    expect(blocks).toEqual(['Legacy template: raw input'])
  })
})
