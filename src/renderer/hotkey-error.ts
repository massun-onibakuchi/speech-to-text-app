import type { HotkeyErrorNotification } from '../shared/ipc'
import type { ActivityItem } from './activity-feed'

export const toHotkeyErrorMessage = (notification: HotkeyErrorNotification): string =>
  `Shortcut ${notification.combo} failed: ${notification.message}`

export const applyHotkeyErrorNotification = (
  notification: HotkeyErrorNotification,
  addToast: (message: string, tone: ActivityItem['tone']) => void
): void => {
  const message = toHotkeyErrorMessage(notification)
  addToast(message, 'error')
}
