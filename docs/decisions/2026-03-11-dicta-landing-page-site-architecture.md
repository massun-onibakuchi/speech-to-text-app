<!--
Where: docs/decisions/2026-03-11-dicta-landing-page-site-architecture.md
What: Decision record for the Dicta landing page site structure and locale handling.
Why: Capture the non-trivial architecture choice to add a dedicated static site inside the Electron repo.
-->

# Decision: Dicta Landing Page Site Architecture

Date: 2026-03-11  
Status: Accepted

## Context

The repository is primarily an Electron/Vite desktop app.  
The new work requires a static product landing page that must:

- deploy for free on GitHub Pages
- support English and Japanese
- stay visually aligned with the app brand
- avoid coupling to Electron runtime code

## Decision

1. Add the landing page as a dedicated `site/` app inside the repo.
2. Build the landing page with Vite + React using a separate `site/vite.config.ts`.
3. Keep locale handling client-side and static-host friendly:
   - use English and Japanese content modules
   - detect browser preference on first visit
   - persist manual language selection in local storage
   - always show a manual language switcher
4. Deploy the built site through a dedicated GitHub Pages workflow.

## Rationale

- A dedicated `site/` directory keeps marketing-page concerns separate from Electron renderer concerns.
- Reusing the repo’s existing React/Vite toolchain keeps the setup small and understandable.
- GitHub Pages has no server-side locale negotiation, so client-side locale resolution is the simplest stable approach.
- Persisted locale choice prevents the browser preference from overriding an explicit user decision on later visits.

## Consequences

- Landing-page code must remain browser-only and must not import Electron runtime modules.
- Site build, testing, and documentation now need to live alongside the desktop app workflow.
- Future public-site changes should preserve the project-site base path unless repository hosting changes.
- Static shell assets that must load before React boots, such as the favicon, should live under `site/public/` so Vite can publish them at the configured base path.
- Hero headline accent copy should rotate as discrete words so the mobile layout stays readable while the preview scenes advance.
