<!-- Where: docs/decisions/window-close-background-shortcuts.md | What: decision for window-close lifecycle behavior with tray/global shortcuts | Why: clarify expected behavior across installed and dist runs -->

# Decision: Keep App Alive After Main Window Close

## Context
- The app registers global shortcuts in the Electron main process.
- Recording shortcuts are executed by dispatching commands from the main process to renderer windows.
- Closing the main window destroyed the only renderer, so recording shortcuts could no longer complete after the window was closed.
- Issue #150 reported this during manual testing by launching the app directly from `dist/`.

## Decision
- Treat the main window close button as "hide to background" during normal operation so the renderer remains alive for recording shortcut handling.
- Allow real window close only during explicit app quit (`before-quit` marks quit intent first).
- Global shortcuts remain active until the user explicitly quits the app (for example via the tray menu) or the process exits.
- This expectation applies to both installed builds and manual `dist/` launches.

## Consequences
- Window close now behaves consistently with the documented background-shortcut user flow and preserves renderer-backed recording shortcuts.
- Non-macOS `window-all-closed` behavior remains unchanged (app quits when all windows are actually closed).
- `will-quit` remains the single place where global shortcuts are unregistered.
- Users can still fully exit via explicit quit actions.
