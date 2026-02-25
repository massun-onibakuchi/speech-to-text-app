// src/main/infrastructure/sound-asset-paths.ts
// What: Canonical path resolver for bundled runtime sound asset files.
// Why:  Centralises dev/prod path resolution so SoundService (issue #96)
//       and tests can import paths from one authoritative source (issue #94).
//       In dev mode the files live at <project-root>/resources/sounds/;
//       in a packaged build they are included via electron-builder "files".

import { app } from 'electron'
import { join } from 'node:path'

// Resolve the root of the resources/sounds directory.
// app.isPackaged is false during `electron-vite dev`, true in distributed builds.
const soundsDir = (): string =>
  join(app.isPackaged ? app.getAppPath() : process.cwd(), 'resources', 'sounds')

/**
 * Absolute paths to each bundled MP3 sound asset, keyed by recording event.
 * Evaluated lazily via getters so the module can be imported before `app` is
 * fully ready without throwing.
 *
 * Audio event → file mapping (decision #96):
 *   recording_started       → zapsplat_household_alarm_clock_button_press_12967.mp3
 *   recording_stopped       → sound_ex_machina_Button_Blip.mp3
 *   recording_cancelled     → zapsplat_multimedia_click_button_short_sharp_73510.mp3
 *   transformation_succeeded→ zapsplat_multimedia_notification_alert_ping_bright_chime_001_93276.mp3
 *   transformation_failed   → zapsplat_multimedia_ui_notification_classic_bell_synth_success_107505.mp3
 */
export const SOUND_ASSET_PATHS = {
  get recordingStarted() {
    return join(soundsDir(), 'zapsplat_household_alarm_clock_button_press_12967.mp3')
  },
  get recordingStopped() {
    return join(soundsDir(), 'sound_ex_machina_Button_Blip.mp3')
  },
  get recordingCancelled() {
    return join(soundsDir(), 'zapsplat_multimedia_click_button_short_sharp_73510.mp3')
  },
  get transformationSucceeded() {
    return join(soundsDir(), 'zapsplat_multimedia_notification_alert_ping_bright_chime_001_93276.mp3')
  },
  get transformationFailed() {
    return join(soundsDir(), 'zapsplat_multimedia_ui_notification_classic_bell_synth_success_107505.mp3')
  }
} as const
