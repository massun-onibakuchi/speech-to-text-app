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

const flushPickerSetup = async (): Promise<void> => {
  // pickProfile() now captures frontmost-app focus asynchronously before creating the
  // picker window, then awaits loadURL().then(show/focus), so tests need a few
  // microtasks before emitting window events.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

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
  it('renders profile names and focused-entry hint text', () => {
    const html = buildPickerHtml([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    expect(html).toContain('Pick Transformation Profile')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
    expect(html).toContain('Focused on open')
    expect(html).toContain('Pick and run')
  })

  // Token names and values must exactly mirror styles.css so the picker matches the main window.
  it('uses exact OKLCH tokens from styles.css and main-window variable names', () => {
    const html = buildPickerHtml([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    expect(html).toContain('color-scheme: dark;')
    // Exact OKLCH values — same as styles.css, no hex conversion rounding.
    expect(html).toContain('oklch(0.13 0.005 260)') // --background
    expect(html).toContain('oklch(0.95 0 0)')        // --popover-foreground
    expect(html).toContain('oklch(0.18 0.005 260)') // --popover (floating surface)
    expect(html).toContain('oklch(0.25 0.008 260)') // --border
    expect(html).toContain('oklch(0.55 0.01 260)')  // --muted-foreground
    expect(html).toContain('oklch(0.22 0.008 260)') // --accent
    expect(html).toContain('oklch(0.65 0.2 145)')   // --ring
    // Correct semantic variable names — match styles.css popover pair.
    expect(html).toContain('var(--popover)')
    expect(html).toContain('var(--popover-foreground)')
    expect(html).toContain('var(--muted-foreground)')
    expect(html).toContain('var(--ring)')
    // No legacy picker-only names that diverge from the design system.
    expect(html).not.toContain('var(--text)')
    expect(html).not.toContain('var(--focus)')
    expect(html).not.toContain('var(--foreground)')
    expect(html).not.toContain('var(--muted)')
    // Interactive state selectors.
    expect(html).toContain('.item:hover,')
    expect(html).toContain('.item[aria-selected="true"]')
    expect(html).toContain('.item:focus-visible')
    // Radius, spacing, shadow.
    expect(html).toContain('border-radius: 8px;')
    expect(html).toContain('padding: 10px 14px;')
    expect(html).toContain('box-shadow')
    // Title is foreground color, not uppercase (matches SettingsSectionHeader).
    expect(html).not.toContain('text-transform: uppercase')
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
    const focusBridge = {
      captureFrontmostAppId: vi.fn(async () => 'com.google.Chrome'),
      restoreFrontmostAppId: vi.fn(async () => undefined)
    }
    const service = new ProfilePickerService({
      create,
      focusBridge
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await flushPickerSetup()
    harness.emitNavigate('picker://select/b')

    await expect(pending).resolves.toBe('b')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        useContentSize: true,
        height: buildPickerWindowHeight(2)
      })
    )
    expect(focusBridge.captureFrontmostAppId).toHaveBeenCalledOnce()
    expect(focusBridge.restoreFrontmostAppId).toHaveBeenCalledWith('com.google.Chrome')
    expect(harness.window.show).toHaveBeenCalledOnce()
    expect(harness.window.focus).toHaveBeenCalledOnce()
    expect(harness.window.close).toHaveBeenCalled()
  })

  it('returns null when picker window closes without selection', async () => {
    const harness = createWindowHarness()
    const focusBridge = {
      captureFrontmostAppId: vi.fn(async () => 'com.apple.Safari'),
      restoreFrontmostAppId: vi.fn(async () => undefined)
    }
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window),
      focusBridge
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await flushPickerSetup()
    harness.emitClosed()

    await expect(pending).resolves.toBeNull()
    expect(focusBridge.restoreFrontmostAppId).toHaveBeenCalledWith('com.apple.Safari')
  })

  it('encodes profile list into data-url html payload', async () => {
    const harness = createWindowHarness()
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window)
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await flushPickerSetup()

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
    await flushPickerSetup()
    const second = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')

    expect(create).toHaveBeenCalledTimes(1)

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
    await flushPickerSetup()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(pending).resolves.toBeNull()
    expect(harness.window.close).toHaveBeenCalled()
  })

  it('still opens and resolves when focus snapshot capture fails', async () => {
    const harness = createWindowHarness()
    const focusBridge = {
      captureFrontmostAppId: vi.fn(async () => {
        throw new Error('capture failed')
      }),
      restoreFrontmostAppId: vi.fn(async () => undefined)
    }
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window),
      focusBridge
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await flushPickerSetup()
    harness.emitNavigate('picker://select/b')

    await expect(pending).resolves.toBe('b')
    expect(focusBridge.restoreFrontmostAppId).not.toHaveBeenCalled()
  })

  it('still resolves the picked profile when focus restore fails', async () => {
    const harness = createWindowHarness()
    const focusBridge = {
      captureFrontmostAppId: vi.fn(async () => 'com.google.Chrome'),
      restoreFrontmostAppId: vi.fn(async () => {
        throw new Error('restore failed')
      })
    }
    const service = new ProfilePickerService({
      create: vi.fn(() => harness.window),
      focusBridge
    })

    const pending = service.pickProfile([makePreset('a', 'Alpha'), makePreset('b', 'Beta')], 'a')
    await flushPickerSetup()
    harness.emitNavigate('picker://select/a')

    await expect(pending).resolves.toBe('a')
    expect(focusBridge.restoreFrontmostAppId).toHaveBeenCalledWith('com.google.Chrome')
  })
})
