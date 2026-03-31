/**
 * Where: src/main/services/temporary-popup-shortcut-manager.ts
 * What:  Shared owner-aware temporary global-shortcut stack for transient popup windows.
 * Why:   Multiple small macOS popups can be visible in one process, so Escape and
 *        navigation shortcuts must hand off cleanly instead of conflicting.
 */

import { globalShortcut } from 'electron'

export interface PopupShortcutManagerLike {
  acquire(ownerId: string, bindings: Readonly<Record<string, () => void>>): void
  release(ownerId: string): void
}

interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

export class TemporaryPopupShortcutManager implements PopupShortcutManagerLike {
  private readonly globalShortcut: GlobalShortcutLike
  private readonly owners = new Map<string, Readonly<Record<string, () => void>>>()
  private readonly ownerStack: string[] = []
  private activeAccelerators = new Set<string>()

  constructor(dependencies?: { globalShortcut?: GlobalShortcutLike }) {
    this.globalShortcut = dependencies?.globalShortcut ?? globalShortcut
  }

  acquire(ownerId: string, bindings: Readonly<Record<string, () => void>>): void {
    this.owners.set(ownerId, bindings)
    this.promoteOwner(ownerId)
    this.rebuild()
  }

  release(ownerId: string): void {
    this.owners.delete(ownerId)
    this.removeOwner(ownerId)
    this.rebuild()
  }

  private promoteOwner(ownerId: string): void {
    this.removeOwner(ownerId)
    this.ownerStack.push(ownerId)
  }

  private removeOwner(ownerId: string): void {
    const ownerIndex = this.ownerStack.lastIndexOf(ownerId)
    if (ownerIndex >= 0) {
      this.ownerStack.splice(ownerIndex, 1)
    }
  }

  private rebuild(): void {
    for (const accelerator of this.activeAccelerators) {
      this.globalShortcut.unregister(accelerator)
    }
    this.activeAccelerators = new Set<string>()

    const activeOwnerId = this.ownerStack.at(-1)
    if (!activeOwnerId) {
      return
    }

    const bindings = this.owners.get(activeOwnerId)
    if (!bindings) {
      return
    }

    for (const [accelerator, callback] of Object.entries(bindings)) {
      const registered = this.globalShortcut.register(accelerator, callback)
      if (registered) {
        this.activeAccelerators.add(accelerator)
      }
    }
  }
}

export const temporaryPopupShortcutManager = new TemporaryPopupShortcutManager()
