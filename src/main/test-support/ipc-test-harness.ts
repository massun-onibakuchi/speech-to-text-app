// src/main/test-support/ipc-test-harness.ts
// Lightweight IPC simulation for integration tests.
// Mimics Electron's ipcMain.handle/invoke pattern without requiring Electron.
// The handler receives a null event arg (first param) to match Electron's signature.

type Handler = (...args: unknown[]) => unknown | Promise<unknown>

export class IpcTestHarness {
  private readonly handlers = new Map<string, Handler>()

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler)
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`)
    }
    // Simulate the IpcMainInvokeEvent arg that Electron passes as first param.
    return handler(null, ...args)
  }
}
