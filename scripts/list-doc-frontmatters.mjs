#!/usr/bin/env node
/*
 * Where: scripts/list-doc-frontmatters.mjs
 * What: Compatibility wrapper for the portable repo-docs frontmatter inventory script.
 * Why: Preserve existing repo-level commands while the actual implementation ships with
 *      the copyable repo-docs skill bundle.
 */

import { run } from '../.agents/skills/repo-docs/scripts/list-doc-frontmatters.mjs'
import { fileURLToPath } from 'node:url'
export * from '../.agents/skills/repo-docs/scripts/list-doc-frontmatters.mjs'

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = run()
}
