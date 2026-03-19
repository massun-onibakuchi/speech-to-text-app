// Where: Shared test coverage.
// What: Verifies the checked-in WhisperLiveKit reference archive stays aligned with the pinned runtime version.
// Why: The repo now keeps a source reference zip under resources/references, so version bumps should fail tests
//      unless the archive and README are refreshed together.

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LOCAL_RUNTIME_VERSION } from './local-runtime'

const REFERENCE_ZIP_NAME = `whisperlivekit-${LOCAL_RUNTIME_VERSION}-pypi-source.zip`
const REFERENCE_ZIP_SHA256 = 'eaa671c02602057a3acd491fd62f4e870ba02d8fda4eba0ebdbfd87a358cb85d'
const UPSTREAM_SDIST_URL =
  'https://files.pythonhosted.org/packages/4b/c6/082707567d2c45fc86057d763d181a339cc140397a1a9bfcdc6fdd6a882d/whisperlivekit-0.2.20.post1.tar.gz'
const REFERENCES_README_URL = new URL('../../resources/references/README.md', import.meta.url)
const REFERENCE_ZIP_URL = new URL(`../../resources/references/${REFERENCE_ZIP_NAME}`, import.meta.url)

describe('local runtime reference archive', () => {
  it('tracks the pinned WhisperLiveKit source zip in resources/references', () => {
    expect(existsSync(REFERENCE_ZIP_URL)).toBe(true)

    const referencesReadme = readFileSync(REFERENCES_README_URL, 'utf8')
    const zipDigest = createHash('sha256').update(readFileSync(REFERENCE_ZIP_URL)).digest('hex')

    expect(referencesReadme).toContain(`WhisperLiveKit ${LOCAL_RUNTIME_VERSION}`)
    expect(referencesReadme).toContain(UPSTREAM_SDIST_URL)
    expect(referencesReadme).toContain(REFERENCE_ZIP_NAME)
    expect(referencesReadme).toContain(REFERENCE_ZIP_SHA256)
    expect(referencesReadme).toContain('pypi.org/project/whisperlivekit')
    expect(zipDigest).toBe(REFERENCE_ZIP_SHA256)
  })
})
