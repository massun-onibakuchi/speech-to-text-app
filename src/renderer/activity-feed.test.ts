import { describe, expect, it } from 'vitest'
import { appendActivityItem, appendTerminalActivityItem, clearActivityItems, type ActivityItem } from './activity-feed'

const makeItem = (id: number, message: string): ActivityItem => ({
  id,
  message,
  tone: 'info',
  createdAt: '12:00:00 PM'
})

describe('activity-feed', () => {
  it('clears the activity list to empty', () => {
    const items: ActivityItem[] = [makeItem(1, 'a'), makeItem(2, 'b')]
    const cleared = clearActivityItems()

    expect(items).toHaveLength(2)
    expect(cleared).toEqual([])
  })

  it('prepends entries and enforces max list size', () => {
    let items: ActivityItem[] = []
    items = appendActivityItem(items, makeItem(1, 'first'), 2)
    items = appendActivityItem(items, makeItem(2, 'second'), 2)
    items = appendActivityItem(items, makeItem(3, 'third'), 2)

    expect(items).toHaveLength(2)
    expect(items[0]?.message).toBe('third')
    expect(items[1]?.message).toBe('second')
  })

  it('enforces terminal-feed cap of 10 items', () => {
    let items: ActivityItem[] = []
    for (let id = 1; id <= 12; id += 1) {
      items = appendTerminalActivityItem(items, makeItem(id, `item-${id}`))
    }

    expect(items).toHaveLength(10)
    expect(items[0]?.message).toBe('item-12')
    expect(items[9]?.message).toBe('item-3')
  })
})
