/*
 * Where: src/renderer/activity-feed-react.test.tsx
 * What: Tests for the activity feed card/status redesign.
 * Why: Guard semantic border mapping, status icon/badge rendering, empty state,
 *      and hover-reveal action presence per spec section 6.3.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityItem } from './activity-feed'
import { ActivityFeedReact } from './activity-feed-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const flushWithFakeTimers = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(0)
    await Promise.resolve()
  })
}

let root: Root | null = null
let writeTextSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeTextSpy = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextSpy },
    configurable: true
  })
})

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const makeItem = (overrides: Partial<ActivityItem>): ActivityItem => ({
  id: 1,
  message: 'Test message',
  tone: 'info',
  createdAt: '12:00:00',
  ...overrides
})

describe('ActivityFeedReact (STY-04)', () => {
  it('renders empty state with Loader2 icon when activity is empty', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ActivityFeedReact activity={[]} />)
    await flush()

    expect(host.textContent).toContain('No activity yet.')
    // No cards
    expect(host.querySelectorAll('article').length).toBe(0)
  })

  it('renders a card for each activity item', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact
        activity={[
          makeItem({ id: 1, tone: 'success', message: 'Done' }),
          makeItem({ id: 2, tone: 'error', message: 'Failed' }),
          makeItem({ id: 3, tone: 'info', message: 'In progress' })
        ]}
      />
    )
    await flush()

    expect(host.querySelectorAll('article').length).toBe(3)
  })

  it('applies border-success/20 to succeeded cards', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact activity={[makeItem({ tone: 'success' })]} />
    )
    await flush()

    const card = host.querySelector('article')
    expect(card?.className).toContain('border-success/20')
  })

  it('applies border-destructive/30 to failed cards', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact activity={[makeItem({ tone: 'error' })]} />
    )
    await flush()

    const card = host.querySelector('article')
    expect(card?.className).toContain('border-destructive/30')
  })

  it('renders status badge text for each tone', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact
        activity={[
          makeItem({ id: 1, tone: 'success' }),
          makeItem({ id: 2, tone: 'error' }),
          makeItem({ id: 3, tone: 'info' })
        ]}
      />
    )
    await flush()

    expect(host.textContent).toContain('Succeeded')
    expect(host.textContent).toContain('Failed')
    expect(host.textContent).toContain('Processing')
  })

  it('renders message content inside each card', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact activity={[makeItem({ message: 'Transcription complete' })]} />
    )
    await flush()

    expect(host.textContent).toContain('Transcription complete')
  })

  it('renders timestamp per card', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact activity={[makeItem({ createdAt: '09:15:30' })]} />
    )
    await flush()

    expect(host.textContent).toContain('09:15:30')
  })

  it('renders feed container with role="log" for accessibility', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact activity={[makeItem({ tone: 'info' })]} />
    )
    await flush()

    const log = host.querySelector('[role="log"]')
    expect(log).not.toBeNull()
    expect(log?.getAttribute('aria-live')).toBe('polite')
  })

  it('shows copied confirmation on successful copy and resets after timeout', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ActivityFeedReact activity={[makeItem({ id: 99, message: 'Copy me' })]} />)
    await flush()

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Copy message"]')
    vi.useFakeTimers()
    expect(button?.getAttribute('data-copy-state')).toBe('idle')
    await act(async () => {
      button?.click()
    })
    await flushWithFakeTimers()

    expect(writeTextSpy).toHaveBeenCalledWith('Copy me')
    expect(button?.getAttribute('data-copy-state')).toBe('copied')

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await flushWithFakeTimers()
    expect(button?.getAttribute('data-copy-state')).toBe('idle')
  })

  it('does not show copied confirmation when clipboard write fails', async () => {
    writeTextSpy = vi.fn(async () => {
      throw new Error('clipboard unavailable')
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true
    })

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ActivityFeedReact activity={[makeItem({ id: 100, message: 'No copy' })]} />)
    await flush()

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Copy message"]')
    button?.click()
    await flush()

    expect(writeTextSpy).toHaveBeenCalledWith('No copy')
    expect(button?.getAttribute('data-copy-state')).toBe('idle')
  })

  it('keeps confirmation until the latest timer after rapid recopy', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ActivityFeedReact activity={[makeItem({ id: 101, message: 'Rapid copy' })]} />)
    await flush()

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Copy message"]')
    vi.useFakeTimers()
    await act(async () => {
      button?.click()
    })
    await flushWithFakeTimers()
    await act(async () => {
      vi.advanceTimersByTime(1000)
      button?.click()
    })
    await flushWithFakeTimers()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    await flushWithFakeTimers()
    expect(button?.getAttribute('data-copy-state')).toBe('copied')

    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    await flushWithFakeTimers()
    expect(button?.getAttribute('data-copy-state')).toBe('idle')
  })

  it('clears pending copy-reset timer on unmount', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ActivityFeedReact activity={[makeItem({ id: 102, message: 'Unmount copy' })]} />)
    await flush()

    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Copy message"]')?.click()
    })
    await flushWithFakeTimers()
    root?.unmount()
    root = null
    vi.runAllTimers()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('keeps copy confirmation state isolated to the copied row', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <ActivityFeedReact
        activity={[
          makeItem({ id: 201, message: 'First row' }),
          makeItem({ id: 202, message: 'Second row' })
        ]}
      />
    )
    await flush()

    const buttons = host.querySelectorAll<HTMLButtonElement>('button[aria-label="Copy message"]')
    expect(buttons).toHaveLength(2)
    vi.useFakeTimers()

    await act(async () => {
      buttons[0].click()
    })
    await flushWithFakeTimers()

    expect(buttons[0].getAttribute('data-copy-state')).toBe('copied')
    expect(buttons[1].getAttribute('data-copy-state')).toBe('idle')
  })
})
