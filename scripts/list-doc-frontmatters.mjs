#!/usr/bin/env node
/*
 * Where: scripts/list-doc-frontmatters.mjs
 * What: Inventory controlled doc frontmatters as Markdown for autonomous agent review.
 * Why: Keep the repo-side logic facts-only so CI can hand agents a compact, low-token
 *      snapshot without embedding lifecycle judgment in the script itself.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './validate-doc-frontmatter.mjs'

const CONTROLLED_DIRS = [
  { type: 'adr', label: 'ADR', path: 'docs/adr' },
  { type: 'plan', label: 'Plan', path: 'docs/plans' },
  { type: 'research', label: 'Research', path: 'docs/research' }
]

const PRIMARY_FIELD_ORDER_BY_TYPE = {
  adr: ['title', 'description', 'date', 'status'],
  plan: ['title', 'description', 'date', 'status', 'review_by'],
  research: ['title', 'description', 'date', 'status', 'review_by']
}

const formatFrontmatterValue = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && String(item).trim() !== '').join(', ')
  }

  return String(value)
}

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

const getPrimaryFieldOrder = (type) => PRIMARY_FIELD_ORDER_BY_TYPE[type] ?? ['status']

const flattenFrontmatter = (type, data) => {
  const fields = []
  const extras = []

  for (const key of getPrimaryFieldOrder(type)) {
    const value = data[key]
    if (value === undefined || value === null || value === '') {
      continue
    }
    fields.push([key, formatFrontmatterValue(value)])
  }

  if (data.links && typeof data.links === 'object' && !Array.isArray(data.links)) {
    const linkKeys = Object.keys(data.links).sort((left, right) => left.localeCompare(right))
    for (const linkKey of linkKeys) {
      const value = data.links[linkKey]
      if (value === undefined || value === null || value === '') {
        continue
      }
      fields.push([`links.${linkKey}`, String(value)])
    }
  }

  if (Array.isArray(data.tags) && data.tags.length > 0) {
    const tags = data.tags
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => String(value))
    if (tags.length > 0) {
      fields.push(['tags', tags.join(', ')])
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (
      key === 'type' ||
      getPrimaryFieldOrder(type).includes(key) ||
      key === 'links' ||
      key === 'tags' ||
      value === undefined ||
      value === null ||
      value === ''
    ) {
      continue
    }

    if (Array.isArray(value)) {
      const joined = value
        .filter((item) => item !== undefined && item !== null && String(item).trim() !== '')
        .map((item) => String(item))
        .join(', ')
      if (joined !== '') {
        extras.push([key, joined])
      }
      continue
    }

    if (value && typeof value === 'object') {
      const nestedKeys = Object.keys(value).sort((left, right) => left.localeCompare(right))
      for (const nestedKey of nestedKeys) {
        const nestedValue = value[nestedKey]
        if (nestedValue === undefined || nestedValue === null || nestedValue === '') {
          continue
        }
        extras.push([`${key}.${nestedKey}`, String(nestedValue)])
      }
      continue
    }

    extras.push([key, String(value)])
  }

  extras.sort(([left], [right]) => left.localeCompare(right))
  return [...fields, ...extras]
}

export const collectControlledDocFrontmatters = (repoRoot = process.cwd()) =>
  CONTROLLED_DIRS.map((directory) => {
    const absoluteDirectory = join(repoRoot, directory.path)
    const docs = walkMarkdownFiles(absoluteDirectory).map((absolutePath) => {
      const repoRelativePath = relative(repoRoot, absolutePath).replace(/\\/g, '/')
      const content = readFileSync(absolutePath, 'utf8')

      try {
        const frontmatter = parseFrontmatter(content)
        return {
          path: repoRelativePath,
          fields: flattenFrontmatter(directory.type, frontmatter)
        }
      } catch (error) {
        return {
          path: repoRelativePath,
          error: error instanceof Error ? error.message : 'Unable to parse frontmatter.'
        }
      }
    })

    return {
      ...directory,
      docs
    }
  })

export const formatControlledDocFrontmatters = (sections) => {
  const lines = ['# Controlled Doc Frontmatters', '']

  for (const section of sections) {
    lines.push(`## ${section.label}`)

    if (section.docs.length === 0) {
      lines.push('- none')
      lines.push('')
      continue
    }

    for (const doc of section.docs) {
      lines.push(`- path: ${doc.path}`)

      if (doc.error) {
        lines.push(`  - error: ${doc.error}`)
        continue
      }

      for (const [key, value] of doc.fields) {
        lines.push(`  - ${key}: ${value}`)
      }
    }

    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export const run = ({ repoRoot = process.cwd(), stdout = process.stdout } = {}) => {
  const sections = collectControlledDocFrontmatters(repoRoot)
  stdout.write(formatControlledDocFrontmatters(sections))
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = run()
}
