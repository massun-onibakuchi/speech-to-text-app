<!--
Where: specs/option-a-decision-report.md
What: Shareable stack decision report for v1 without requiring prior project context.
Why: Communicate the decision, alternatives, and rationale clearly to new stakeholders.
-->

# STT App Stack Decision Report

## Topic

Choose the implementation stack for a macOS speech-to-text utility (v1) that supports:
- Recording speech and transcription
- Optional LLM transformation
- Global shortcut workflow
- VPN-required operation with split-tunnel compatibility for Groq access
- Standard desktop app operation

## Contexts

- Product scope is macOS-only for v1, personal-use focus.
- Reliability is critical: back-to-back recordings must not drop results.
- User workflow is desktop app + global shortcuts.
- Accessibility permission is required for paste-at-cursor behavior.
- VPN must stay enabled; Groq may fail unless `api.groq.com` is split-tunneled by the VPN client.
- If Groq is unreachable, the app should fail with routing guidance (no automatic provider fallback).

## Options

### Option A: Native macOS (`SwiftUI`/`AppKit` + Swift concurrency + Keychain)
- Best OS integration for global shortcuts, permissions, and paste behavior.
- Strong performance and low runtime overhead.
- Strong fit for stable desktop app behavior.
- Weighted score: **89/100**

### Option B: Tauri 2 (`Rust` backend + TypeScript frontend)
- Good performance and security with smaller footprint than Electron.
- Cross-platform path is easier if needed later.
- Higher complexity due to Rust + TypeScript split.
- Weighted score: **81/100**

### Option C: Electron (`Node.js` + TypeScript frontend)
- Fastest developer onboarding for web-heavy teams.
- Mature ecosystem and tooling.
- Highest runtime overhead and larger artifacts.
- Weighted score: **75/100**

## Reason why we go with Option A

- It is the strongest match for macOS-native requirements: global shortcuts, accessibility permissions, and paste-at-cursor reliability.
- It gives the best performance and startup footprint for a latency-sensitive utility.
- It supports a clean desktop app architecture with native permission handling and shortcut control.
- It reduces integration risk under VPN constraints by keeping networking and diagnostics close to OS-native control paths.
- It has the highest weighted evaluation score (**89/100**) across integration quality, desktop fit, performance, VPN operability, and maintainability.
