export interface ActivityItem {
  id: number
  stableKey?: string
  message: string
  tone: 'info' | 'success' | 'error'
  createdAt: string
}

export const appendActivityItem = (items: ActivityItem[], item: ActivityItem, maxItems = 24): ActivityItem[] => {
  const next = [item, ...items]
  return next.slice(0, maxItems)
}

export const appendTerminalActivityItem = (items: ActivityItem[], item: ActivityItem): ActivityItem[] =>
  appendActivityItem(items, item, 10)

export const upsertActivityItem = (items: ActivityItem[], item: ActivityItem, maxItems = 24): ActivityItem[] => {
  const existingIndex = item.stableKey
    ? items.findIndex((candidate) => candidate.stableKey === item.stableKey)
    : -1
  if (existingIndex === -1) {
    return appendActivityItem(items, item, maxItems)
  }

  const withoutExisting = items.filter((_candidate, index) => index !== existingIndex)
  return appendActivityItem(withoutExisting, item, maxItems)
}

export const clearActivityItems = (): ActivityItem[] => []
