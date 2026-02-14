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
- Highest local dev environment friction when primary development runs in Linux containers.
- Final weighted score is in the scorecard table below.

### Option B: Tauri 2 (`Rust` backend + TypeScript frontend)
- Good performance and security with smaller footprint than Electron.
- Cross-platform path is easier if needed later.
- Higher complexity due to Rust + TypeScript split.
- Final weighted score is in the scorecard table below.

### Option C: Electron (`Node.js` + TypeScript frontend)
- Fastest developer onboarding for web-heavy teams.
- Mature ecosystem and tooling.
- Highest runtime overhead and larger artifacts.
- Final weighted score is in the scorecard table below.

## Additional Factor: Dev Setup Difficulty in Isolated Linux Containers

- This factor should be explicitly included in stack evaluation because AI agents here run in isolated Linux Docker containers.
- For macOS desktop apps, Swift language support on Linux is not enough: `SwiftUI` and `AppKit` require Apple SDKs/Xcode and cannot be fully built or signed in a Linux-only environment.
- Practical implication: Option A remains best for product/runtime fit, but development requires at least one macOS build lane (local Mac or hosted macOS CI runner) for compile, signing, and release validation.

## Feedback Validation

- Arithmetic check is correct: totals in the previous score table were mathematically valid.
- Feasibility risk is correct: macOS build/signing is a hard prerequisite and should not be treated as only a soft weighted preference.
- Correctness risk is correct: single-point subjective scores with a thin margin can invert with small assumption changes.
- Cost risk is correct: delivery cost/schedule was missing as a first-class factor, and some overlap existed between integration and VPN-related factors.
- There is no measured benchmark dataset in this file yet; scoring below is assumption-based and must be replaced by measured values during implementation.

## Stage 0 Hard Gates (Pass/Fail Before Scoring)

- Gate A: Build, sign, and release path works in CI within target SLA.
- Gate B: Global shortcut + accessibility + paste-at-cursor reliability passes soak tests.
- Gate C: VPN split-tunnel diagnostics are verified in target environments.
- Rule: Any option that fails a gate is blocked until remediation tasks are complete.

Estimated gate status (`Assumed`, not `Measured`):

| Option | Gate A (CI build/sign/release) | Gate B (workflow reliability soak) | Gate C (VPN diagnostics) |
|---|---|---|---|
| Option A | Assumed Pass | Assumed Pass | Assumed Pass |
| Option B | Assumed Pass | Assumed Borderline | Assumed Pass |
| Option C | Assumed Pass | Assumed Borderline/Fail | Assumed Pass |

## Quantitative Scoring Model (Assumption-Based)

Assumption scope:
- The model below uses explicit assumptions consistent with v1 goals.
- Values are placeholders until benchmark and soak-test evidence is collected.

Axes (`X_i`) with anchors:

| Axis | Definition | Unit | Direction | `L_i` (bad) | `U_i` (good) |
|---|---|---:|---|---:|---:|
| `X1` | Workflow reliability (shortcut -> record -> transcribe -> paste success) | `% success` | Higher is better | 90 | 99.9 |
| `X2` | End-to-end latency p95 | `ms` | Lower is better | 2500 | 600 |
| `X3` | Idle memory footprint | `MB` | Lower is better | 500 | 80 |
| `X4` | Linux-first dev feasibility (build/test share without macOS) | `% pipeline` | Higher is better | 20 | 90 |
| `X5` | Delivery cost risk (v1 effort including CI/signing) | `person-weeks` | Lower is better | 16 | 6 |
| `X6` | VPN/Groq failure diagnosability (MTTR) | `minutes` | Lower is better | 120 | 20 |

Estimated raw values used for scoring:

| Option | `X1` | `X2` | `X3` | `X4` | `X5` | `X6` |
|---|---:|---:|---:|---:|---:|---:|
| Option A | 98.5 | 700 | 120 | 35 | 11 | 25 |
| Option B | 95.5 | 900 | 160 | 70 | 13 | 40 |
| Option C | 92.0 | 1300 | 380 | 85 | 9 | 55 |

Normalization to utility `u_i in [0,1]`:
- Higher-better: `u_i = clip((x_i - L_i) / (U_i - L_i), 0, 1)`
- Lower-better: `u_i = clip((L_i - x_i) / (L_i - U_i), 0, 1)`

Weights (`sum = 1.0`):
- `w = [0.30, 0.20, 0.10, 0.15, 0.15, 0.10]`

Computed totals:

| Method | Option A | Option B | Option C |
|---|---:|---:|---:|
| Weighted sum (`sum(w_i * u_i)`) | 0.740 | 0.648 | 0.525 |
| Geometric mean (cross-check) | 0.666 | 0.616 | 0.447 |

Baseline ranking:
- `A > B > C` (unchanged across weighted-sum and geometric cross-check).

## Uncertainty and Sensitivity Rules

- Score ranges (estimate uncertainty, not measured benchmarks):

| Option | Score range | Confidence |
|---|---|---:|
| Option A | 0.67-0.79 | 0.72 |
| Option B | 0.57-0.73 | 0.63 |
| Option C | 0.45-0.61 | 0.68 |

Sensitivity scenarios (weights explicitly rebalanced to sum `1.0`):

| Scenario | Weights `[w1,w2,w3,w4,w5,w6]` | A | B | C | Winner |
|---|---|---:|---:|---:|---|
| Baseline | `[0.30,0.20,0.10,0.15,0.15,0.10]` | 0.740 | 0.648 | 0.525 | A |
| Dev-feasibility priority shift | `[0.20,0.20,0.10,0.30,0.10,0.10]` | 0.661 | 0.685 | 0.603 | B |
| Cost deterioration for A (`X5: 11 -> 14`) | Baseline + metric change only | 0.695 | 0.648 | 0.525 | A |
| Reliability improvement for B (`X1: 95.5 -> 97.5`) | Baseline + metric change only | 0.740 | 0.709 | 0.525 | A |

Decision acceptance rule:
- Final decision is accepted only if the chosen option passes all Stage 0 gates and remains top under agreed sensitivity scenarios.
- If winner flips across scenarios, treat decision as conditional and resolve the dominant uncertainty drivers first.

