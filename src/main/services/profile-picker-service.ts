// Where: src/main/services/profile-picker-service.ts
// What:  Dedicated BrowserWindow picker used by pick-and-run profile selection.
// Why:   Provides a focused profile-selection UX without coupling to renderer routes.

import type { TransformationPreset } from '../../shared/domain'

const PICK_RESULT_URL_PREFIX = 'picker://select/'
const WINDOW_WIDTH = 380
// Content-area sizing targets for picker HTML layout (excluding native title bar).
// Each list item renders two lines (name + tag), so the row height is much larger
// than a single-line button.
const WINDOW_BASE_HEIGHT = 90
const WINDOW_ITEM_HEIGHT = 52
const WINDOW_MAX_VISIBLE_ITEMS = 5
const PICKER_AUTO_CLOSE_TIMEOUT_MS = 60_000

export interface PickerBrowserWindowOptions {
  width: number
  height: number
  useContentSize?: boolean
  resizable: boolean
  maximizable: boolean
  minimizable: boolean
  fullscreenable: boolean
  alwaysOnTop: boolean
  autoHideMenuBar: boolean
  show: boolean
  frame: boolean
  title: string
  webPreferences: {
    contextIsolation: boolean
    nodeIntegration: boolean
    sandbox: boolean
  }
}

export interface PickerWindowWebContentsLike {
  on(event: 'will-navigate', listener: (event: { preventDefault: () => void }, url: string) => void): void
}

export interface PickerBrowserWindowLike {
  webContents: PickerWindowWebContentsLike
  loadURL(url: string): Promise<void> | void
  show(): void
  focus(): void
  close(): void
  isDestroyed?(): boolean
  on(event: 'closed', listener: () => void): void
}

export interface PickerWindowFactoryLike {
  create(options: PickerBrowserWindowOptions): PickerBrowserWindowLike
}

export interface PickerFocusBridgeLike {
  captureFrontmostAppId(): Promise<string | null>
  restoreFrontmostAppId(appId: string): Promise<void>
}

export interface ProfilePickerServiceDependencies extends PickerWindowFactoryLike {
  focusBridge?: PickerFocusBridgeLike
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const escapeInlineScriptJson = (value: string): string => value.replaceAll('</script>', '<\\/script>')

const buildPickerWindowHeight = (presetCount: number): number => {
  const visibleItemCount = Math.min(WINDOW_MAX_VISIBLE_ITEMS, Math.max(presetCount, 1))
  return WINDOW_BASE_HEIGHT + visibleItemCount * WINDOW_ITEM_HEIGHT
}

const buildPickerHtml = (presets: readonly TransformationPreset[], focusedPresetId: string): string => {
  const itemsJson = escapeInlineScriptJson(
    JSON.stringify(
      presets.map((preset) => ({
        id: preset.id,
        name: preset.name
      }))
    )
  )
  const escapedFocusedId = escapeInlineScriptJson(JSON.stringify(focusedPresetId))

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pick Transformation Profile</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        /* Tokens aligned to app OKLCH palette (style-update.md §4.1). */
        --background: #1a1a1f; /* oklch(0.13 0.005 260) */
        --card: #1e1e25;       /* oklch(0.16 0.005 260) */
        --border: #363641;     /* oklch(0.25 0.008 260) */
        --text: #f2f2f2;       /* oklch(0.95 0 0) */
        --muted: #898990;      /* oklch(0.55 0.01 260) */
        --accent: #2b2b34;     /* oklch(0.22 0.008 260) */
        --focus: #44c97b;      /* oklch(0.65 0.2 145) — primary/ring */
      }
      body {
        margin: 0;
        background: var(--background);
        color: var(--text);
      }
      .shell {
        padding: 8px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px; /* matches --radius: 0.5rem */
        overflow: hidden;
        /* shadow removed: spec §9 bans hardcoded RGBA drop shadows; the border provides separation */
      }
      .title {
        margin: 0;
        padding: 8px 12px 6px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted); /* matches text-xs text-muted-foreground section header */
      }
      .hint {
        margin: 0;
        padding: 0 12px 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: ${WINDOW_MAX_VISIBLE_ITEMS * WINDOW_ITEM_HEIGHT}px;
        overflow-y: auto;
      }
      .item {
        display: block;
        width: 100%;
        border: 0;
        border-top: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        text-align: left;
        padding: 8px 12px; /* tightened to match py-2 px-3 */
        font-size: 13px;
        cursor: pointer;
        transition: background-color 120ms ease-in-out;
      }
      .item:hover,
      .item[aria-selected="true"] {
        background: var(--accent);
      }
      .item:focus-visible {
        outline: 2px solid var(--focus);
        outline-offset: -3px; /* inset ring matches app focus ring style */
      }
      .item-name {
        display: block;
        font-weight: 500; /* medium weight; 600 was too heavy relative to app */
      }
      .item-tag {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <h1 class="title">Pick Transformation Profile</h1>
        <p class="hint">Use Up/Down then Enter. Escape cancels.</p>
        <ul class="list" id="picker-list" role="listbox" aria-label="Transformation profiles"></ul>
      </section>
    </main>
    <script>
      const items = ${itemsJson};
      const focusedId = ${escapedFocusedId};
      const listNode = document.getElementById('picker-list');
      let selectedIndex = Math.max(
        0,
        items.findIndex((item) => item.id === focusedId)
      );

      const select = (nextIndex) => {
        selectedIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
        const buttons = listNode.querySelectorAll('button.item');
        for (let index = 0; index < buttons.length; index += 1) {
          const button = buttons[index];
          const selected = index === selectedIndex;
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
          if (selected) {
            button.focus();
            button.scrollIntoView({ block: 'nearest' });
          }
        }
      };

      const pick = (index) => {
        const item = items[index];
        if (!item) {
          return;
        }
        window.location.href = 'picker://select/' + encodeURIComponent(item.id);
      };

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'item';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        button.innerHTML = '<span class="item-name">' + item.name.replace(/[&<>\"']/g, (ch) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '\"': '&quot;',
          \"'\": '&#39;'
        }[ch])) + '</span><span class="item-tag">' + (item.id === focusedId ? 'Focused on open' : 'Pick and run') + '</span>';
        button.addEventListener('click', () => pick(index));
        li.appendChild(button);
        listNode.appendChild(li);
      }

      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          select(selectedIndex + 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          select(selectedIndex - 1);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          pick(selectedIndex);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          window.close();
        }
      });

      select(selectedIndex);
    </script>
  </body>
</html>`
}

const toDataUrl = (html: string): string => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`

export class ProfilePickerService {
  private readonly windowFactory: PickerWindowFactoryLike
  private readonly focusBridge: PickerFocusBridgeLike | null
  private activeSession: { window: PickerBrowserWindowLike; promise: Promise<string | null> } | null = null

  constructor(dependencies: ProfilePickerServiceDependencies) {
    this.windowFactory = { create: dependencies.create }
    this.focusBridge = dependencies.focusBridge ?? null
  }

  private async captureFrontmostAppId(): Promise<string | null> {
    if (!this.focusBridge) {
      return null
    }
    try {
      return await this.focusBridge.captureFrontmostAppId()
    } catch {
      return null
    }
  }

  private async restoreFrontmostAppId(appId: string | null): Promise<void> {
    if (!this.focusBridge || !appId) {
      return
    }
    try {
      await this.focusBridge.restoreFrontmostAppId(appId)
    } catch {
      // Best-effort only: picker selection/cancel should still resolve even if focus restore fails.
    }
  }

  async pickProfile(presets: readonly TransformationPreset[], focusedPresetId: string): Promise<string | null> {
    if (presets.length === 0) {
      return null
    }

    if (presets.length === 1) {
      return presets[0].id
    }

    const existingSession = this.activeSession
    if (existingSession && existingSession.window.isDestroyed?.() !== true) {
      existingSession.window.show()
      existingSession.window.focus()
      return existingSession.promise
    }
    this.activeSession = null

    // Capture the currently frontmost app before the picker window steals focus.
    const previousFrontmostAppId = await this.captureFrontmostAppId()

    const pickerWindow = this.windowFactory.create({
      width: WINDOW_WIDTH,
      height: buildPickerWindowHeight(presets.length),
      useContentSize: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      show: false,
      frame: true,
      title: 'Pick Transformation Profile',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const promise = new Promise<string | null>((resolve) => {
      let settled = false
      let autoCloseTimer: ReturnType<typeof setTimeout> | null = null
      const finish = (value: string | null, closeWindow = true): void => {
        if (settled) {
          return
        }
        settled = true
        if (autoCloseTimer !== null) {
          clearTimeout(autoCloseTimer)
          autoCloseTimer = null
        }
        this.activeSession = null
        void (async () => {
          if (closeWindow && pickerWindow.isDestroyed?.() !== true) {
            pickerWindow.close()
          }
          await this.restoreFrontmostAppId(previousFrontmostAppId)
          resolve(value)
        })()
      }

      pickerWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(PICK_RESULT_URL_PREFIX)) {
          return
        }
        event.preventDefault()
        const pickedId = decodeURIComponent(url.slice(PICK_RESULT_URL_PREFIX.length))
        const exists = presets.some((preset) => preset.id === pickedId)
        finish(exists ? pickedId : null)
      })

      pickerWindow.on('closed', () => {
        finish(null, false)
      })

      const html = buildPickerHtml(presets, focusedPresetId)
      void Promise.resolve(pickerWindow.loadURL(toDataUrl(html)))
        .then(() => {
          if (settled) {
            return
          }
          pickerWindow.show()
          pickerWindow.focus()
          autoCloseTimer = setTimeout(() => {
            finish(null)
          }, PICKER_AUTO_CLOSE_TIMEOUT_MS)
        })
        .catch(() => {
          finish(null)
        })
    })

    this.activeSession = { window: pickerWindow, promise }
    return promise
  }
}

export { buildPickerHtml, buildPickerWindowHeight }
