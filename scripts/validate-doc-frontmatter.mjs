#!/usr/bin/env node
/*
 * Where: scripts/validate-doc-frontmatter.mjs
 * What: Compatibility wrapper for the portable repo-docs validator script.
 * Why: Preserve existing repo-level commands while the actual implementation lives
 *      inside the copyable repo-docs skill bundle.
 */

import { run } from '../.agents/skills/repo-docs/scripts/validate-doc-frontmatter.mjs'
import { fileURLToPath } from 'node:url'
export * from '../.agents/skills/repo-docs/scripts/validate-doc-frontmatter.mjs'

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = run()
}
