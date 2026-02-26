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

const buildPickerHtml = (presets: readonly TransformationPreset[], currentActiveId: string): string => {
  const itemsJson = escapeInlineScriptJson(
    JSON.stringify(
      presets.map((preset) => ({
        id: preset.id,
        name: preset.name
      }))
    )
  )
  const escapedActiveId = escapeInlineScriptJson(JSON.stringify(currentActiveId))

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pick Transformation Profile</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #f4f6f9;
        color: #0f172a;
      }
      .shell {
        padding: 12px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #d8dee9;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
        overflow: hidden;
      }
      .title {
        margin: 0;
        padding: 12px 14px 8px;
        font-size: 14px;
        font-weight: 600;
      }
      .hint {
        margin: 0;
        padding: 0 14px 10px;
        font-size: 12px;
        color: #64748b;
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
        border-top: 1px solid #edf2f7;
        background: #ffffff;
        color: #0f172a;
        text-align: left;
        padding: 10px 14px;
        font-size: 13px;
        cursor: pointer;
      }
      .item:hover,
      .item[aria-selected="true"] {
        background: #dbeafe;
      }
      .item-name {
        display: block;
        font-weight: 600;
      }
      .item-tag {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: #475569;
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
      const activeId = ${escapedActiveId};
      const listNode = document.getElementById('picker-list');
      let selectedIndex = Math.max(
        0,
        items.findIndex((item) => item.id === activeId)
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
        }[ch])) + '</span><span class="item-tag">' + (item.id === activeId ? 'Currently active' : 'Set active and run') + '</span>';
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
  private activeSession: { window: PickerBrowserWindowLike; promise: Promise<string | null> } | null = null

  constructor(windowFactory: PickerWindowFactoryLike) {
    this.windowFactory = windowFactory
  }

  pickProfile(presets: readonly TransformationPreset[], currentActiveId: string): Promise<string | null> {
    if (presets.length === 0) {
      return Promise.resolve(null)
    }

    if (presets.length === 1) {
      return Promise.resolve(presets[0].id)
    }

    const existingSession = this.activeSession
    if (existingSession && existingSession.window.isDestroyed?.() !== true) {
      existingSession.window.show()
      existingSession.window.focus()
      return existingSession.promise
    }
    this.activeSession = null

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
        resolve(value)
        if (!closeWindow) {
          return
        }
        if (pickerWindow.isDestroyed?.() === true) {
          return
        }
        pickerWindow.close()
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

      const html = buildPickerHtml(presets, currentActiveId)
      void Promise.resolve(pickerWindow.loadURL(toDataUrl(html)))
        .then(() => {
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
