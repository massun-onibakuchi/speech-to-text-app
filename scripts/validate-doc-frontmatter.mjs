#!/usr/bin/env node
/*
 * Where: scripts/validate-doc-frontmatter.mjs
 * What: Validate frontmatter for controlled decision, plan, and research docs.
 * Why: Keep PR CI enforceable for doc metadata without relying on manual review
 *      to catch malformed lifecycle fields or inconsistent controlled-doc schemas.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTROLLED_PATHS = ['docs/decisions/', 'docs/plans/', 'docs/research/']
const DEFAULT_DOCS_ROOT = 'docs'
const VALIDATION_MODE_FLAGS = new Set(['--all', '--changed-only'])
const LINK_KEYS = new Set(['issue', 'epic', 'pr', 'decision'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_SLUG_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/
const DECISION_REVIEW_TRIGGER_MAX_LENGTH = 512
const RESEARCH_QUESTION_MAX_LENGTH = 1024

const DOC_RULES = {
  decision: {
    required: new Set(['type', 'status']),
    allowed: new Set(['type', 'status', 'links', 'review_by', 'review_trigger', 'tags']),
    statuses: new Set(['proposed', 'accepted', 'superseded', 'rejected'])
  },
  plan: {
    required: new Set(['type', 'status', 'review_by']),
    allowed: new Set(['type', 'status', 'links', 'review_by', 'tags']),
    statuses: new Set(['draft', 'active', 'completed', 'abandoned'])
  },
  research: {
    required: new Set(['type', 'status', 'question', 'review_by']),
    allowed: new Set(['type', 'status', 'question', 'links', 'review_by', 'tags']),
    statuses: new Set(['active', 'concluded', 'archived', 'abandoned'])
  }
}

const parseScalar = (raw) => {
  const value = raw.trim()
  if (value === '') {
    return ''
  }

  if (value === 'null' || value === '~') {
    return null
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

export const parseFrontmatter = (content) => {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match) {
    throw new Error('Missing YAML frontmatter block.')
  }

  const lines = match[1].split('\n')
  const data = {}

  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }

    const topLevel = line.match(/^([a-z_][a-z0-9_]*):(.*)$/i)
    if (!topLevel) {
      throw new Error(`Unsupported frontmatter line: ${line}`)
    }

    const [, key, rawValue] = topLevel
    const trimmed = rawValue.trim()

    if (trimmed !== '') {
      data[key] = parseScalar(trimmed)
      index += 1
      continue
    }

    const next = lines[index + 1]
    if (!next || next.trim() === '') {
      data[key] = ''
      index += 1
      continue
    }

    if (/^\s{2}-\s+/.test(next)) {
      const items = []
      index += 1
      while (index < lines.length) {
        const itemLine = lines[index]
        const itemMatch = itemLine.match(/^\s{2}-\s+(.*)$/)
        if (!itemMatch) {
          break
        }
        items.push(parseScalar(itemMatch[1]))
        index += 1
      }
      data[key] = items
      continue
    }

    if (/^\s{2}[a-z_][a-z0-9_]*:/i.test(next)) {
      const nested = {}
      index += 1
      while (index < lines.length) {
        const childLine = lines[index]
        const childMatch = childLine.match(/^\s{2}([a-z_][a-z0-9_]*):(.*)$/i)
        if (!childMatch) {
          break
        }
        nested[childMatch[1]] = parseScalar(childMatch[2])
        index += 1
      }
      data[key] = nested
      continue
    }

    throw new Error(`Unsupported nested frontmatter content for '${key}'.`)
  }

  return data
}

const inferDocType = (path) => {
  if (path.startsWith('docs/decisions/')) return 'decision'
  if (path.startsWith('docs/plans/')) return 'plan'
  if (path.startsWith('docs/research/')) return 'research'
  return null
}

const isControlledDoc = (path) => CONTROLLED_PATHS.some((prefix) => path.startsWith(prefix)) && path.endsWith('.md')

const walkMarkdownFiles = (directory) => {
  if (!existsSync(directory)) {
    return []
  }

  const entries = readdirSync(directory, { withFileTypes: true })
  const paths = []

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(...walkMarkdownFiles(absolutePath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      paths.push(absolutePath)
    }
  }

  return paths.sort((left, right) => left.localeCompare(right))
}

const validatePresence = (field, value, errors) => {
  if (value === undefined) {
    errors.push(`Missing required field '${field}'.`)
    return
  }

  if (value === null || value === '') {
    errors.push(`Field '${field}' must not be empty or null.`)
  }
}

const validateDateField = (field, value, errors) => {
  if (value === undefined) {
    return
  }

  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    errors.push(`Field '${field}' must use YYYY-MM-DD.`)
    return
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day

  if (!isRealDate) {
    errors.push(`Field '${field}' must be a real calendar date.`)
  }
}

const validateTags = (value, errors) => {
  if (value === undefined) {
    return
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    errors.push("Field 'tags' must be a list of non-empty strings.")
  }
}

const validateLinks = (value, errors) => {
  if (value === undefined) {
    return
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push("Field 'links' must be a nested map.")
    return
  }

  for (const [key, linkValue] of Object.entries(value)) {
    if (!LINK_KEYS.has(key)) {
      errors.push(`Field 'links.${key}' is not allowed.`)
      continue
    }

    if (linkValue === null || linkValue === '' || typeof linkValue !== 'string') {
      errors.push(`Field 'links.${key}' must be a non-empty string.`)
    }
  }
}

export const validateDocContent = (path, content) => {
  const docType = inferDocType(path)
  if (!docType) {
    return []
  }

  const errors = []
  const basename = path.split('/').pop() ?? path
  if (!DATE_SLUG_FILENAME_PATTERN.test(basename)) {
    errors.push("Controlled doc filenames must use 'YYYY-MM-DD-<slug>.md'.")
  }

  let data

  try {
    data = parseFrontmatter(content)
  } catch (error) {
    return [error instanceof Error ? error.message : 'Invalid frontmatter.']
  }

  const rules = DOC_RULES[docType]
  const keys = Object.keys(data)

  for (const key of keys) {
    if (!rules.allowed.has(key)) {
      errors.push(`Field '${key}' is not allowed for ${docType} docs.`)
    }
  }

  for (const field of rules.required) {
    validatePresence(field, data[field], errors)
  }

  if (data.type !== undefined && data.type !== null && data.type !== '' && data.type !== docType) {
    errors.push(`Field 'type' must be '${docType}' for ${path}.`)
  }

  if (data.status !== undefined && data.status !== null && data.status !== '') {
    if (typeof data.status !== 'string' || !rules.statuses.has(data.status)) {
      errors.push(`Field 'status' must be one of: ${[...rules.statuses].join(', ')}.`)
    }
  }

  validateDateField('review_by', data.review_by, errors)
  validateLinks(data.links, errors)
  validateTags(data.tags, errors)

  if (docType === 'decision') {
    const hasReviewBy = data.review_by !== undefined
    const hasReviewTrigger = data.review_trigger !== undefined

    if (hasReviewBy !== hasReviewTrigger) {
      errors.push("Decision docs must set 'review_by' and 'review_trigger' together.")
    }

    if (
      hasReviewBy &&
      data.status !== undefined &&
      data.status !== null &&
      data.status !== '' &&
      data.status !== 'accepted'
    ) {
      errors.push("Decision docs may use 'review_by' only when status is 'accepted'.")
    }

    if (
      hasReviewTrigger &&
      (typeof data.review_trigger !== 'string' || data.review_trigger.trim() === '')
    ) {
      errors.push("Field 'review_trigger' must be a non-empty string.")
    }

    if (
      typeof data.review_trigger === 'string' &&
      data.review_trigger.length > DECISION_REVIEW_TRIGGER_MAX_LENGTH
    ) {
      errors.push(
        `Field 'review_trigger' must be at most ${DECISION_REVIEW_TRIGGER_MAX_LENGTH} characters.`
      )
    }
  }

  if (
    docType === 'research' &&
    data.question !== undefined &&
    data.question !== null &&
    data.question !== '' &&
    (typeof data.question !== 'string' || data.question.trim() === '')
  ) {
    errors.push("Field 'question' must be a non-empty string.")
  }

  if (
    docType === 'research' &&
    typeof data.question === 'string' &&
    data.question.length > RESEARCH_QUESTION_MAX_LENGTH
  ) {
    errors.push(`Field 'question' must be at most ${RESEARCH_QUESTION_MAX_LENGTH} characters.`)
  }

  return errors
}

export const validateDocFile = (path) => validateDocContent(path, readFileSync(path, 'utf8'))

export const collectChangedControlledDocPaths = ({
  env = process.env,
  exec = execFileSync
} = {}) => {
  const baseRef = env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : 'origin/main'
  const output = exec(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`, '--'],
    { encoding: 'utf8' }
  )

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isControlledDoc)
}

export const collectAllControlledDocPaths = ({
  docsRoot = DEFAULT_DOCS_ROOT,
  cwd = process.cwd()
} = {}) =>
  walkMarkdownFiles(join(cwd, docsRoot))
    .map((absolutePath) => relative(cwd, absolutePath).replace(/\\/g, '/'))
    .filter(isControlledDoc)

export const collectControlledDocPaths = ({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  exec = execFileSync
} = {}) => {
  const explicitPaths = argv.filter((value) => value.endsWith('.md'))
  if (explicitPaths.length > 0) {
    return explicitPaths.filter(isControlledDoc)
  }

  const mode = argv.find((value) => VALIDATION_MODE_FLAGS.has(value)) ?? '--all'
  const allPaths = collectAllControlledDocPaths({ cwd })
  if (mode === '--all') {
    return allPaths
  }

  return collectChangedControlledDocPaths({ env, exec })
}

export const run = ({ argv = process.argv.slice(2), env = process.env } = {}) => {
  const paths = collectControlledDocPaths({ argv, env })
  if (paths.length === 0) {
    console.log('[docs-frontmatter] no controlled docs to validate')
    return 0
  }

  let failed = false

  for (const path of paths) {
    const errors = validateDocFile(path)
    if (errors.length === 0) {
      console.log(`[docs-frontmatter] ok ${path}`)
      continue
    }

    failed = true
    console.error(`[docs-frontmatter] invalid ${path}`)
    for (const error of errors) {
      console.error(`- ${error}`)
    }
  }

  return failed ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = run()
}
