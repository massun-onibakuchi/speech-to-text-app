---
title: Wrap WhisperLiveKit with an app-auth guard for localhost supervision
description: Enforce the app-owned localhost auth contract with a generated wrapper around WhisperLiveKit because the upstream server does not natively require our token on HTTP and WebSocket entrypoints.
date: 2026-03-19
status: accepted
tags:
  - architecture
  - streaming
  - localhost
  - security
---

<!--
Where: docs/adr/0004-wrap-whisperlivekit-with-app-auth-guard.md
What: Durable decision for how the app enforces localhost auth around WhisperLiveKit.
Why: Ticket 4 needs a concrete security contract before session-control and websocket tickets build on top of it.
-->

# Context

ADR-0003 established that the first local streaming runtime is:

- an app-managed optional WhisperLiveKit localhost service
- loopback only
- pinned and supervised by Electron main

That ADR also accepted a hard requirement:

- localhost access must require an app-owned auth token or equivalent handshake

The upstream WhisperLiveKit `basic_server` currently exposes the service surface we want:

- `GET /health`
- `GET /v1/models`
- websocket `/asr`

But it does not natively require an app-owned token on those entrypoints.

So Ticket 4 has to choose how the app satisfies the localhost auth requirement without forking the upstream runtime or pretending loopback-only is sufficient by itself.

# Discussion

## Option A

Rely on loopback binding alone and skip app-owned localhost auth.

Why this is attractive:

- least implementation work
- no wrapper layer
- no launch-time auth coordination

Why this fails:

- it does not satisfy the approved local-runtime contract
- any local process on the machine could still talk to the loopback service if it learns the port
- later tickets would build on a knowingly incomplete security boundary

## Option B

Mint tokens now but defer actual enforcement until the websocket/session-client ticket.

Why this is attractive:

- keeps Ticket 4 small
- still establishes token-shaped interfaces for later tickets

Why this fails:

- it would create “security-shaped” data without security behavior
- readiness probes and control-plane requests would still be unauthenticated
- future tickets would inherit a misleading contract and might never close the gap cleanly

## Option C

Wrap WhisperLiveKit with an app-auth guard at service launch time.

How it works:

- the supervisor mints a fresh app-owned localhost auth token per launched service process
- the app starts a generated host script instead of calling the upstream server entrypoint directly
- that host script imports WhisperLiveKit’s server app and guards both HTTP and WebSocket entrypoints before forwarding traffic
- the supervisor uses the same token for authenticated readiness and health probes
- later runtime clients receive the chosen endpoint plus the token from the supervisor rather than inventing their own localhost contract

Why this is attractive:

- satisfies the approved auth requirement immediately
- keeps version ownership and process supervision in the app
- avoids maintaining a long-lived fork of WhisperLiveKit
- gives Ticket 6 a concrete endpoint-plus-token contract instead of a placeholder

Trade-off:

- the app now owns a thin compatibility wrapper around the upstream runtime
- if upstream later adds first-class auth support, the wrapper may become replaceable

# Decision

Use Option C.

The app will wrap WhisperLiveKit with a generated app-auth guard for the managed localhost service.

The guard will:

- enforce an app-owned token on both HTTP and WebSocket entrypoints
- preserve loopback-only binding
- let the supervisor perform authenticated readiness and health checks
- keep the upstream runtime package unmodified and version-pinned by the install manager

# Consequences

Good:

- Ticket 4 delivers a real localhost security contract instead of a deferred placeholder
- session-control and websocket tickets can depend on one supervisor-issued endpoint-plus-token shape
- the app keeps using upstream WhisperLiveKit without carrying a package fork

Bad:

- the app owns one more generated runtime artifact and must keep it compatible with upstream server startup
- readiness failures can now come from either the upstream server or the guard layer, so diagnostics must stay explicit

Follow-up implications:

- Ticket 6 should consume the supervisor-issued auth token when opening websocket sessions
- if upstream WhisperLiveKit later exposes first-class auth enforcement, revisit this ADR and simplify the launch path if the replacement is truly equivalent
