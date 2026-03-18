// Where: Main process service layer.
// What: Small mutable gate that reports whether a local streaming session is currently active.
// Why: Runtime install/update/uninstall must be blocked while a local session is active, and later tickets
//      need a shared seam to toggle that state without hard-coding install-manager behavior in the composition root.

export class LocalStreamingSessionGate {
  private activeSessionCount = 0

  isSessionActive(): boolean {
    return this.activeSessionCount > 0
  }

  markSessionStarted(): void {
    this.activeSessionCount += 1
  }

  markSessionEnded(): void {
    this.activeSessionCount = Math.max(0, this.activeSessionCount - 1)
  }
}
