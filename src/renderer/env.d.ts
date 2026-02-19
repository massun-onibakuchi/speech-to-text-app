/// <reference types="vite/client" />

import type { IpcApi } from '../shared/ipc'

export {}

declare global {
  interface ImportMetaEnv {
    readonly VITE_RENDERER_MODE?: 'react' | 'vanilla'
  }

  interface Window {
    speechToTextApi: IpcApi
  }
}
