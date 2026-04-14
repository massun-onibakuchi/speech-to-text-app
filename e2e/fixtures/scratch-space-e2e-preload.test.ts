/**
 * Where: e2e/fixtures/scratch-space-e2e-preload.test.ts
 * What:  Regression tests for the scratch-space E2E preload fixture contract.
 * Why:   The popup smoke test depends on this test preload matching the production
 *        scratch-space renderer API surface closely enough to boot reliably.
 */

import path from 'node:path'
import fs from 'node:fs'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const exposedValues = new Map<string, unknown>()
const invoke = vi.fn(async () => {})
const on = vi.fn()
const removeListener = vi.fn()

describe('scratch-space-e2e-preload fixture', () => {
  afterEach(() => {
    exposedValues.clear()
    invoke.mockClear()
    on.mockClear()
    removeListener.mockClear()
  })

  it('exposes the scratch-space bootstrap methods required by the renderer', async () => {
    const fixturePath = path.resolve(process.cwd(), 'e2e/fixtures/scratch-space-e2e-preload.cjs')
    const fixtureSource = fs.readFileSync(fixturePath, 'utf8')
    const context = {
      module: { exports: {} },
      exports: {},
      require: (specifier: string) => {
        if (specifier === 'electron') {
          return {
            contextBridge: {
              exposeInMainWorld: (key: string, value: unknown) => {
                exposedValues.set(key, value)
              }
            },
            ipcRenderer: {
              invoke,
              on,
              removeListener
            }
          }
        }

        throw new Error(`Unexpected fixture dependency: ${specifier}`)
      }
    }

    vm.runInNewContext(fixtureSource, context, { filename: fixturePath })

    const api = exposedValues.get('speechToTextApi') as {
      notifyScratchSpaceReady?: () => Promise<void>
      onOpenScratchSpacePresetMenu?: (listener: () => void) => () => void
    }

    expect(api.notifyScratchSpaceReady).toBeTypeOf('function')
    expect(api.onOpenScratchSpacePresetMenu).toBeTypeOf('function')

    await api.notifyScratchSpaceReady?.()
    expect(invoke).toHaveBeenCalledWith('scratch-space:renderer-ready')

    const cleanup = api.onOpenScratchSpacePresetMenu?.(() => {})
    expect(on).toHaveBeenCalledWith('scratch-space:open-preset-menu', expect.any(Function))
    cleanup?.()
    expect(removeListener).toHaveBeenCalledWith('scratch-space:open-preset-menu', expect.any(Function))
  })
})
