// src/main/infrastructure/tray-icon-path.ts
// What: Canonical path resolver for tray icon assets.
// Why:  Keep window-manager focused on tray behavior while this module handles
//       dev vs packaged path resolution for menu-bar icon loading.

import { join } from 'node:path'
import { app } from 'electron'

type TrayDirOptions = {
  isPackaged: boolean
  cwd: string
  resourcesPath: string
}

export const resolveTrayDir = ({ isPackaged, cwd, resourcesPath }: TrayDirOptions): string => {
  if (isPackaged) {
    return join(resourcesPath, 'tray')
  }
  return join(cwd, 'resources', 'tray')
}

const trayDir = (): string =>
  resolveTrayDir({
    isPackaged: app.isPackaged,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath
  })

export const TRAY_ICON_PATHS = {
  get sttTemplate2x() {
    return join(trayDir(), 'sttTemplate@2x.png')
  }
} as const
