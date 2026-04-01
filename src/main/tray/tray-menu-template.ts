/**
 * Where: src/main/tray/tray-menu-template.ts
 * What:  Native tray-menu template builder for menu-bar output controls.
 * Why:   Keep tray business logic out of WindowManager while rendering
 *        persisted output state as native radio and checkbox menu items.
 */

import type { MenuItemConstructorOptions } from 'electron'
import type { Settings } from '../../shared/domain'
import type { OutputTextSource } from '../../shared/domain'
import { getSelectedOutputDestinations } from '../../shared/output-selection'

export type OutputDestinationKey = 'copyToClipboard' | 'pasteAtCursor'

export interface TrayMenuActions {
  openSettings: () => void
  setOutputSource: (selection: OutputTextSource) => void
  toggleDestination: (destination: OutputDestinationKey) => void
}

export const buildDefaultTrayMenuTemplate = (actions: Pick<TrayMenuActions, 'openSettings'>): MenuItemConstructorOptions[] => [
  {
    label: 'Settings...',
    click: () => actions.openSettings()
  },
  { type: 'separator' },
  {
    label: 'Quit',
    role: 'quit'
  }
]

export const buildTrayMenuTemplate = (
  settings: Readonly<Settings>,
  actions: TrayMenuActions
): MenuItemConstructorOptions[] => {
  const selectedDestinations = getSelectedOutputDestinations(settings.output)

  return [
    {
      label: 'Settings...',
      click: () => actions.openSettings()
    },
    {
      label: 'Output Mode',
      submenu: [
        {
          label: 'Raw dictation',
          type: 'radio',
          checked: settings.output.selectedTextSource === 'transcript',
          click: () => actions.setOutputSource('transcript')
        },
        {
          label: 'Transformed text',
          type: 'radio',
          checked: settings.output.selectedTextSource === 'transformed',
          click: () => actions.setOutputSource('transformed')
        }
      ]
    },
    {
      label: 'Output Destinations',
      submenu: [
        {
          label: 'Copy to clipboard',
          type: 'checkbox',
          checked: selectedDestinations.copyToClipboard,
          click: () => actions.toggleDestination('copyToClipboard')
        },
        {
          label: 'Paste at cursor',
          type: 'checkbox',
          checked: selectedDestinations.pasteAtCursor,
          click: () => actions.toggleDestination('pasteAtCursor')
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit',
      role: 'quit'
    }
  ]
}
