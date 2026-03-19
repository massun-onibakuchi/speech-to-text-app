// Where: Main process service layer.
// What: Small mutable gate that reports whether a local streaming session is currently active.
// Why: Runtime install/update/uninstall must be blocked while a local session is active, and the install manager
//      needs an externally driven seam for that state instead of inferring session lifecycle on its own.

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
