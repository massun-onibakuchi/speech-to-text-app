export interface ActivityItem {
  id: number
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

export const clearActivityItems = (): ActivityItem[] => []
