<!--
Where: docs/plans/2026-03-11-dicta-landing-page-execution-plan.md
What: Detailed execution plan for the Dicta GitHub Pages landing page.
Why: Record agreed scope, constraints, sequencing, and review expectations before implementation.
-->

# Dicta Landing Page Execution Plan

Date: 2026-03-11  
Status: In Progress

## 1. Goal

Create a static product landing page for `Dicta` that:

- is hosted for free on GitHub Pages under this repository path
- matches the current app brand and style direction
- supports English and Japanese
- presents shipped value only
- uses stylized product mockups instead of raw screenshots

## 2. Locked decisions

- Product name: `Dicta`
- Primary CTA: GitHub Releases page
- Hosting model: GitHub Pages project site for this repository
- Domain model: no custom domain
- Locale posture: English-first with Japanese alternate
- Locale UX: auto-detect browser preference on first visit and always show a manual language switcher
- Design posture: marketing-oriented presentation that still follows the current dark app brand
- Visual assets: stylized mockups derived from the app UI
- Messaging posture: exclude roadmap and in-progress work

## 3. Product framing

The landing page should position Dicta as a practical macOS desktop tool for turning spoken thoughts into usable text quickly.

The hero copy should:

- create curiosity without becoming vague
- keep product identity obvious within one or two lines
- avoid generic AI-product phrasing

The core proof points should emphasize:

- fast speech capture to usable text
- optional refinement into cleaner writing
- repeatable daily workflow through shortcuts, profiles, audio input selection, and dictionary support

## 4. Brand and visual direction

The landing page should inherit the product’s current visual DNA:

- dark-only palette
- muted panel surfaces
- crisp borders
- green primary accents
- red reserved for recording/live emphasis
- mono accents for technical labels and controls

The page should adapt that into a more spacious marketing composition:

- larger type hierarchy than the desktop app
- stronger hero framing
- more intentional negative space
- restrained motion only where it reinforces product behavior

Visual motifs to reuse:

- recording pulse
- waveform bars
- compact app chrome
- status dots
- card rails and framed product surfaces

## 5. Information architecture

The page should be structured as:

1. Hero
2. Feature strip with 3 remarkable features
3. How it works
4. Product showcase with stylized mockups
5. Credibility/details section
6. FAQ or reassurance section
7. Final CTA

## 6. Content model

The content system should:

- store English and Japanese content separately
- keep a shared section schema between locales
- allow one source of truth for CTA URLs and product metadata
- support locale-specific copy length where needed

The hero should contain:

- headline
- subheadline
- primary CTA
- secondary CTA

The feature strip should contain exactly three feature cards.

## 7. Technical implementation

Create a dedicated static site app inside the repo instead of mixing the LP into Electron renderer code.

Recommended structure:

- `site/`
- `site/index.html`
- `site/src/`
- `site/vite.config.ts`

The site should:

- use the repo’s existing React/Vite stack
- avoid Electron runtime APIs
- reuse installed font packages where appropriate
- keep landing-page code isolated from app runtime code

## 8. GitHub Pages deployment

Deployment should use a dedicated GitHub Actions workflow.

The workflow should:

- install dependencies with pnpm
- run the landing-page build
- upload the built artifact
- deploy through GitHub Pages

The build must handle the repository project-site base path correctly.

## 9. Internationalization behavior

Locale support should work without a backend.

Behavior:

- if there is a stored manual preference, use it
- otherwise inspect browser language
- prefer Japanese when browser language starts with `ja`
- default to English otherwise
- provide a visible language switcher at all times
- persist manual changes locally

## 10. Testing and verification

Add at least one automated test for the landing page.

Preferred coverage:

- locale auto-detection or persistence
- expected hero/CTA rendering
- locale switch output

Verification should include:

- landing-page build
- relevant Vitest run
- manual review of generated static output

## 11. Documentation

Add documentation covering:

- where the LP lives
- how to run it locally
- how to build it
- how GitHub Pages deployment works
- how locale content is maintained

## 12. Review loop

After implementation:

1. run a sub-agent code review
2. run a second review with Claude
3. address findings
4. re-run verification

## 13. Immediate execution order

1. Export this plan to the repo
2. Create the `site/` scaffold
3. Add locale/content plumbing
4. Implement hero and 3-feature strip
5. Implement mockup-driven product sections
6. Add GitHub Pages workflow
7. Add tests and docs
8. Review and iterate
