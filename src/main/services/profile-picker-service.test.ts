// Where: src/main/services/profile-picker-service.test.ts
// What:  Tests for BrowserWindow-based profile picker behavior.
// Why:   Ensure pick-and-run profile selection is deterministic and cancel-safe.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPickerHtml, buildPickerWindowHeight, ProfilePickerService, type PickerBrowserWindowLike } from './profile-picker-service'
import type { TransformationPreset } from '../../shared/domain'

const makePreset = (id: string, name: string): TransformationPreset => ({
  id,
  name,
  provider: 'google',
  model: 'gemini-2.5-flash',
  systemPrompt: '',
  userPrompt: '',
  shortcut: ''
})

const decodeDataUrlHtml = (url: string): string => decodeURIComponent(url.replace('data:text/html;charset=utf-8,', ''))

const createWindowHarness = () => {
  let navigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | null = null
  let closedHandler: (() => void) | null = null
  let loadedUrl = ''
  const close = vi.fn(() => {
    closedHandler?.()
  })

  const window: PickerBrowserWindowLike = {
    webContents: {
      on: vi.fn((event, listener) => {
        if (event === 'will-navigate') {
          navigateHandler = listener
        }
      })
    },
    loadURL: vi.fn(async (url: string) => {
      loadedUrl = url
    }),
    show: vi.fn(),
    focus: vi.fn(),
    close,
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event, listener) => {
      if (event === 'closed') {
        closedHandler = listener
      }
    })
  }

  return {
    window,
    getLoadedUrl: () => loadedUrl,
    emitNavigate: (url: string) => {
      navigateHandler?.({ preventDefault: vi.fn() }, url)
    },
    emitClosed: () => {
      closedHandler?.()
    }
  }
}

describe('buildPickerWindowHeight', () => {
  it('adapts for small lists and clamps visible rows to five', () => {
    const h1 = buildPickerWindowHeight(1)
    const h2 = buildPickerWindowHeight(2)
    const h3 = buildPickerWindowHeight(3)
    const h4 = buildPickerWindowHeight(4)
    const h5 = buildPickerWindowHeight(5)
    const h6 = buildPickerWindowHeight(6)

    expect(h2).toBeGreaterThan(h1)
    expect(h3).toBeGreaterThan(h2)
    expect(h4).toBeGreaterThan(h3)
    expect(h5).toBeGreaterThan(h4)
    expect(h6).toBe(h5)
  })
})

describe('buildPickerHtml', () => {
  it('renders profile names and current-active hint text', () => {
    const html = buildPickerHtml([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    expect(html).toContain('Pick Transformation Profile')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
    expect(html).toContain('Currently active')
    expect(html).toContain('Set active and run')
  })
})

describe('ProfilePickerService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when no presets exist', async () => {
    const create = vi.fn()
    const service = new ProfilePickerService({ create })

    await expect(service.pickProfile([], 'x')).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('auto-selects only preset without creating a picker window', async () => {
    const create = vi.fn()
    const service = new ProfilePickerService({ create })

    await expect(service.pickProfile([makePreset('only', 'Only')], 'only')).resolves.toBe('only')
    expect(create).not.toHaveBeenCalled()
  })

  it('returns selected profile id when picker emits navigate result', async () => {
    const harness = createWindowHarness()
    const create = vi.fn(() => harness.window)
    const service = new ProfilePickerService({
      create
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await Promise.resolve()
    harness.emitNavigate('picker://select/b')

    await expect(pending).resolves.toBe('b')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        useContentSize: true,
        height: buildPickerWindowHeight(2)
      })
    )
    expect(harness.window.show).toHaveBeenCalledOnce()
    expect(harness.window.focus).toHaveBeenCalledOnce()
    expect(harness.window.close).toHaveBeenCalled()
  })

  it('returns null when picker window closes without selection', async () => {
    const harness = createWindowHarness()
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window)
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await Promise.resolve()
    harness.emitClosed()

    await expect(pending).resolves.toBeNull()
  })

  it('encodes profile list into data-url html payload', async () => {
    const harness = createWindowHarness()
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window)
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await Promise.resolve()

    const html = decodeDataUrlHtml(harness.getLoadedUrl())
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')

    harness.emitClosed()
    await pending
  })

  it('reuses the active picker window when pick is triggered twice quickly', async () => {
    const harness = createWindowHarness()
    const create = vi.fn(() => harness.window)
    const service = new ProfilePickerService({ create })

    const first = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await Promise.resolve()
    const second = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')

    expect(create).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    harness.emitNavigate('picker://select/a')
    await expect(first).resolves.toBe('a')
    await expect(second).resolves.toBe('a')
  })

  it('auto-cancels picker after inactivity timeout', async () => {
    vi.useFakeTimers()
    const harness = createWindowHarness()
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window)
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(pending).resolves.toBeNull()
    expect(harness.window.close).toHaveBeenCalled()
  })
})
