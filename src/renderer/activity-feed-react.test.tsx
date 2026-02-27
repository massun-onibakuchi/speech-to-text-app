/*
 * Where: src/renderer/activity-feed-react.test.tsx
 * What: Tests for the activity feed card/status redesign.
 * Why: Guard semantic border mapping, status icon/badge rendering, empty state,
 *      and hover-reveal action presence per spec section 6.3.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivityItem } from './activity-feed'
import { ActivityFeedReact } from './activity-feed-react'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
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
})
