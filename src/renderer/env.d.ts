import type { IpcApi } from '../shared/ipc'

export {}

declare global {
  interface Window {
    speechToTextApi: IpcApi
  }
}
