/*
 * Where: scripts/resolve-release-plan.mjs
 * What: Resolves the release tag and release mode from package.json plus the current GitHub ref.
 * Why: Keep release automation explicit, tag-first, and limited to safe refs.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PACKAGE_JSON_PATH = resolve(SCRIPT_DIR, '../package.json')
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

export const readPackageVersion = (packageJsonPath = DEFAULT_PACKAGE_JSON_PATH) => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const version = packageJson.version

  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    throw new Error(`Expected package.json version to be a semver string, received: ${String(version)}`)
  }

  return version
}

export const toReleaseTag = (version) => `v${version}`

export const resolveReleaseTag = ({ refType, refName, packageVersion }) => {
  const packageTag = toReleaseTag(packageVersion)

  if (refType !== 'tag') {
    return packageTag
  }

  if (refName !== packageTag) {
    throw new Error(`Git ref tag ${refName} does not match package.json version tag ${packageTag}.`)
  }

  return refName
}

export const resolveReleasePlan = ({
  eventName,
  refType,
  refName,
  packageVersion,
  previousPackageVersion
}) => {
  const tagName = resolveReleaseTag({ refType, refName, packageVersion })

  if (refType === 'tag') {
    return {
      tagName,
      shouldRelease: true,
      shouldCreateTag: false,
      source: 'tag'
    }
  }

  if (eventName !== 'push' || refName !== 'main') {
    return {
      tagName,
      shouldRelease: false,
      shouldCreateTag: false,
      source: 'skip'
    }
  }

  const hasPreviousVersion =
    typeof previousPackageVersion === 'string' && previousPackageVersion.length > 0
  const versionChanged = !hasPreviousVersion || previousPackageVersion !== packageVersion

  return {
    tagName,
    shouldRelease: versionChanged,
    shouldCreateTag: versionChanged,
    source: versionChanged ? 'main_version_bump' : 'skip'
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageVersion = readPackageVersion()
  const plan = resolveReleasePlan({
    eventName: process.env.GITHUB_EVENT_NAME,
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
    packageVersion,
    previousPackageVersion: process.env.RELEASE_PREVIOUS_PACKAGE_VERSION
  })

  process.stdout.write(`${JSON.stringify(plan)}\n`)
}
