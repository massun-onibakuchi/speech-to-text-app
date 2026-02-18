// src/main/services/profile-picker-service.ts
// Presents a native macOS context menu for the user to pick a transformation profile.
// Uses Electron Menu.popup() — appears at cursor, no focus steal, instant display.
// See specs/h2-design-pick-and-run-transformation-ux.md for design rationale.

import type { TransformationPreset } from '../../shared/domain'

/** Minimal menu-item shape matching Electron's MenuItemConstructorOptions subset. */
export interface MenuItemTemplate {
  label: string
  type?: 'normal' | 'separator' | 'checkbox'
  checked?: boolean
  click?: () => void
}

/** Abstraction over Electron's Menu instance for testability. */
export interface MenuLike {
  popup(options?: { callback?: () => void }): void
}

/** Abstraction over Electron's Menu static methods for testability. */
export interface MenuFactoryLike {
  buildFromTemplate(template: MenuItemTemplate[]): MenuLike
}

export class ProfilePickerService {
  private readonly menuFactory: MenuFactoryLike

  constructor(menuFactory: MenuFactoryLike) {
    this.menuFactory = menuFactory
  }

  /**
   * Shows a native context menu with the available transformation profiles.
   * Returns the picked profile ID, or null if the user cancels (Escape / click-away).
   * Auto-selects if only one profile exists (skips the menu).
   */
  pickProfile(presets: readonly TransformationPreset[], currentActiveId: string): Promise<string | null> {
    if (presets.length === 0) {
      return Promise.resolve(null)
    }

    // Auto-select when only one profile — no need for a picker.
    if (presets.length === 1) {
      return Promise.resolve(presets[0].id)
    }

    return new Promise<string | null>((resolve) => {
      let resolved = false

      const template: MenuItemTemplate[] = presets.map((preset) => ({
        label: preset.name,
        type: 'checkbox' as const,
        checked: preset.id === currentActiveId,
        click: () => {
          if (!resolved) {
            resolved = true
            resolve(preset.id)
          }
        }
      }))

      const menu = this.menuFactory.buildFromTemplate(template)
      menu.popup({
        callback: () => {
          // Fires when the menu closes. If no item was clicked, resolve null.
          if (!resolved) {
            resolved = true
            resolve(null)
          }
        }
      })
    })
  }
}
