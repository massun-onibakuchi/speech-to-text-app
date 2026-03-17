#!/usr/bin/env node
/*
 * Where: scripts/send-docs-audit-task.mjs
 * What: Send a compact Takopi review prompt to Telegram for controlled-doc review.
 * Why: Keep workflow YAML small and readable while delegating the repo inspection
 *      and lifecycle judgment to the external autonomous reviewer.
 */

import https from 'node:https'
import { fileURLToPath } from 'node:url'

const REQUIRED_ENV_KEYS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TAKOPI_PROJECT_ALIAS']
const DEFAULT_TOPIC_TITLE_PREFIX = 'Docs Audit'
const TELEGRAM_GROUP_CHAT_DELAY_MS = 3000
const PROMPT_TEMPLATE = `Autonomously audit and maintain controlled docs in this repository.

Scope:
- docs/adr/
- docs/plans/
- docs/research/

Tasks:
1. Pull the latest default/base branch and switch to a fresh worktree before editing. Follow the repo workflow for worktree creation rather than editing directly on the current branch.
2. Identify the controlled docs you need to inspect or edit, then validate those specific files after your edits with \`pnpm run docs:validate <doc-path>...\`.
3. Run \`pnpm run docs:frontmatters\` to generate a controlled doc frontmatter inventory from the repo before judging files.
4. Inspect flagged and adjacent docs autonomously in the repo.
5. Find stale, outdated, redundant, malformed, or misfiled docs.
6. Fix issues: keep, update, archive, delete, or rename the docs.
7. Run the necessary validation/tests after your edits, including explicit controlled-doc validation for the files you changed.
8. Create a PR and continue working until the PR is completed.

Constraints:
- Keep the response compact enough to respect Telegram's 4096-character message limit.
- Treat repo parser logic as facts-only.
- Do not treat current frontmatter status alone as evidence that a doc still deserves to exist; re-evaluate from body content and current repo state without using this as a reason to delete durable decisions that still govern the repo.
- Preserve durable decisions unless there is a clear reason to change status or replace them.
- Do not stop to ask the user for approval or clarification during this autonomous flow unless blocked by a hard failure outside the repository.

Return:
- summary
- findings by file
- actions completed by you
- PR status
__GITHUB_RUN_URL_BLOCK__`

const REQUIRED_TEMPLATE_MARKERS = ['__GITHUB_RUN_URL_BLOCK__']

/*
 * Prompt editing rules:
 * - Edit PROMPT_TEMPLATE directly to change the agent instructions.
 * - Keep every marker in REQUIRED_TEMPLATE_MARKERS present in the template.
 * - `__GITHUB_RUN_URL_BLOCK__` is replaced with a blank line plus the run URL when present,
 *   or removed entirely when no run URL is available.
 * - The `/ctx set ...` message is sent separately before the prompt, so the prompt template
 *   should contain task instructions only.
 */
export const validatePromptTemplate = (template) => {
  const missingMarkers = REQUIRED_TEMPLATE_MARKERS.filter((marker) => !template.includes(marker))
  if (missingMarkers.length > 0) {
    throw new Error(
      `Prompt template is missing required marker(s): ${missingMarkers.join(', ')}.`
    )
  }
}

export const buildReviewPrompt = ({
  githubRunUrl,
  template = PROMPT_TEMPLATE
}) => {
  validatePromptTemplate(template)

  const githubRunBlock = githubRunUrl ? `\nGitHub run: ${githubRunUrl}` : ''

  return template
    .replaceAll('__GITHUB_RUN_URL_BLOCK__', githubRunBlock)
    .trim()
}

export const normalizeTakopiProjectAlias = (value) => value.replace(/^\/+/, '').trim()

export const buildCtxCommand = ({ takopiProjectAlias }) =>
  `/ctx set ${normalizeTakopiProjectAlias(takopiProjectAlias)}`

export const buildTopicTitle = ({
  prefix = DEFAULT_TOPIC_TITLE_PREFIX,
  now = new Date()
} = {}) => {
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 16)
  return `${prefix} ${timestamp} UTC`
}

export const waitForTelegramRateLimitWindow = (
  delayMs = TELEGRAM_GROUP_CHAT_DELAY_MS
) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })

export const sendTelegramMessage = ({
  botToken,
  chatId,
  text,
  messageThreadId,
  request = https.request
}) =>
  callTelegramMethod({
    botToken,
    method: 'sendMessage',
    params: {
      chat_id: chatId,
      text,
      ...(messageThreadId ? { message_thread_id: messageThreadId } : {})
    },
    request
  })

export const callTelegramMethod = ({
  botToken,
  method,
  params,
  request = https.request
}) =>
  new Promise((resolve, reject) => {
    const encodedParams = new URLSearchParams(params).toString()
    const telegramRequest = request(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(encodedParams)
        }
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const parsed = JSON.parse(body)
              if (parsed.ok !== true) {
                reject(new Error(`Telegram API error: ${body}`))
                return
              }
              resolve(parsed.result)
            } catch (error) {
              reject(
                new Error(
                  `Telegram API returned non-JSON response: ${
                    error instanceof Error ? error.message : String(error)
                  }`
                )
              )
            }
            return
          }
          reject(new Error(`Telegram API error (${response.statusCode ?? 'unknown'}): ${body}`))
        })
      }
    )

    telegramRequest.on('error', reject)
    telegramRequest.write(encodedParams)
    telegramRequest.end()
  })

export const createTelegramForumTopic = ({
  botToken,
  chatId,
  name,
  request = https.request
}) =>
  callTelegramMethod({
    botToken,
    method: 'createForumTopic',
    params: {
      chat_id: chatId,
      name
    },
    request
  })

export const run = async ({
  env = process.env,
  request = https.request,
  waitForTelegramRateLimitWindow: wait = waitForTelegramRateLimitWindow
} = {}) => {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`)
  }

  const topic = await createTelegramForumTopic({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    name: buildTopicTitle({
      prefix: env.TELEGRAM_TOPIC_TITLE_PREFIX,
      now: env.DOCS_AUDIT_NOW ? new Date(env.DOCS_AUDIT_NOW) : new Date()
    }),
    request
  })
  const messageThreadId = String(topic.message_thread_id)

  // Telegram group/forum chats are paced much more slowly than private chats.
  // We wait 3 seconds before each posted message in the new topic to stay under
  // the default per-chat group rate and avoid bursty workflow sends.
  await wait()
  await sendTelegramMessage({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    text: buildCtxCommand({ takopiProjectAlias: env.TAKOPI_PROJECT_ALIAS }),
    messageThreadId,
    request
  })

  const prompt = buildReviewPrompt({
    githubRunUrl: env.GITHUB_RUN_URL
  })

  await wait()
  await sendTelegramMessage({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    text: prompt,
    messageThreadId,
    request
  })

  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
