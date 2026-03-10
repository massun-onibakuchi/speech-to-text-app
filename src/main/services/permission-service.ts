import { systemPreferences } from 'electron'

export interface AccessibilityPermissionStatus {
  granted: boolean
  guidance: string | null
}

const E2E_ACCESSIBILITY_BYPASS_ENV = 'PLAYWRIGHT_BYPASS_ACCESSIBILITY'

export class PermissionService {
  getAccessibilityPermissionStatus(): AccessibilityPermissionStatus {
    if (process.env[E2E_ACCESSIBILITY_BYPASS_ENV] === '1') {
      return { granted: true, guidance: null }
    }

    if (process.platform !== 'darwin') {
      return {
        granted: false,
        guidance: 'Paste-at-cursor is only supported on macOS.'
      }
    }

    const granted = systemPreferences.isTrustedAccessibilityClient(false)
    if (granted) {
      return { granted: true, guidance: null }
    }

    return {
      granted: false,
      guidance:
        'Enable Accessibility permission for the app in System Settings -> Privacy & Security -> Accessibility.'
    }
  }

  hasAccessibilityPermission(): boolean {
    return this.getAccessibilityPermissionStatus().granted
  }
}
