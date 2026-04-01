/**
 * Where: src/main/tray/tray-output-menu-controller.ts
 * What:  Main-process controller for tray output menu state and mutations.
 * Why:   Centralize persisted output-setting updates, tray refresh, and
 *        renderer notifications behind a small unit-testable seam.
 */

import type { SettingsService } from '../services/settings-service'
import { buildOutputSettingsFromSelection, getSelectedOutputDestinations } from '../../shared/output-selection'
import type { OutputTextSource, Settings } from '../../shared/domain'
import { buildTrayMenuTemplate, type OutputDestinationKey } from './tray-menu-template'

interface TrayOutputMenuControllerDeps {
  settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  setTrayContextMenu: (template: ReturnType<typeof buildTrayMenuTemplate>) => void
  openSettings: () => void
  broadcastSettingsUpdated: () => void
}

export class TrayOutputMenuController {
  private readonly settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  private readonly setTrayContextMenu: TrayOutputMenuControllerDeps['setTrayContextMenu']
  private readonly openSettings: () => void
  private readonly broadcastSettingsUpdated: () => void

  constructor(deps: TrayOutputMenuControllerDeps) {
    this.settingsService = deps.settingsService
    this.setTrayContextMenu = deps.setTrayContextMenu
    this.openSettings = deps.openSettings
    this.broadcastSettingsUpdated = deps.broadcastSettingsUpdated
  }

  refresh(): void {
    this.setTrayContextMenu(
      buildTrayMenuTemplate(this.settingsService.getSettings(), {
        openSettings: () => this.openSettings(),
        setOutputSource: (selection) => this.setOutputSource(selection),
        toggleDestination: (destination) => this.toggleDestination(destination)
      })
    )
  }

  handleRendererSettingsSaved(): void {
    this.refresh()
  }

  private setOutputSource(selection: OutputTextSource): void {
    const settings = this.settingsService.getSettings()
    if (settings.output.selectedTextSource === selection) {
      return
    }

    this.settingsService.setSettings({
      ...settings,
      output: this.buildOutputSettings(settings, selection)
    })
    this.refresh()
    this.broadcastSettingsUpdated()
  }

  private toggleDestination(destination: OutputDestinationKey): void {
    const settings = this.settingsService.getSettings()
    const currentDestinations = getSelectedOutputDestinations(settings.output)

    this.settingsService.setSettings({
      ...settings,
      output: this.buildOutputSettings(settings, settings.output.selectedTextSource, {
        ...currentDestinations,
        [destination]: !currentDestinations[destination]
      })
    })
    this.refresh()
    this.broadcastSettingsUpdated()
  }

  private buildOutputSettings(
    settings: Readonly<Settings>,
    selection: OutputTextSource,
    destinations = getSelectedOutputDestinations(settings.output)
  ): Settings['output'] {
    return buildOutputSettingsFromSelection(settings.output, selection, destinations)
  }
}
