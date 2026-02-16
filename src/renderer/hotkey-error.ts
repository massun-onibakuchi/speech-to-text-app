import type { HotkeyErrorNotification } from '../shared/ipc'
import type { ActivityItem } from './activity-feed'

export const toHotkeyErrorMessage = (notification: HotkeyErrorNotification): string =>
  `Shortcut ${notification.combo} failed: ${notification.message}`

export const applyHotkeyErrorNotification = (
  notification: HotkeyErrorNotification,
  addActivity: (message: string, tone: ActivityItem['tone']) => void,
  addToast: (message: string, tone: ActivityItem['tone']) => void
): void => {
  const message = toHotkeyErrorMessage(notification)
  addActivity(message, 'error')
  addToast(message, 'error')
}
