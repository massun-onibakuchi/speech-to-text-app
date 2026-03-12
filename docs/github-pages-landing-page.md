<!--
Where: docs/github-pages-landing-page.md
What: Local development and deployment guide for the Dicta landing page.
Why: Keep the GitHub Pages site workflow explicit and maintainable alongside the Electron app.
-->

# Dicta Landing Page

The landing page lives in [`site/`](/workspace/.worktrees/feat-github-pages-product-lp/site).

## Local development

Install dependencies from either the repository root or a git worktree checkout:

```sh
pnpm install
```

This relies on [`pnpm-workspace.yaml`](/workspace/.worktrees/feat-github-pages-product-lp/pnpm-workspace.yaml) declaring `packages: ['.']`, so keep that entry intact when editing workspace-level pnpm settings.

Run the site dev server:

```sh
pnpm run site:dev
```

Build the static site:

```sh
pnpm run site:build
```

Preview the built output:

```sh
pnpm run site:preview
```

## Deployment

GitHub Pages deployment is handled by [`.github/workflows/github-pages.yml`](/workspace/.worktrees/feat-github-pages-product-lp/.github/workflows/github-pages.yml).

The workflow:

- installs dependencies with `pnpm`
- builds the landing page
- uploads `site/dist`
- deploys the artifact to GitHub Pages

## Locale behavior

The page supports `en` and `ja`.

Locale resolution order:

1. saved manual preference in local storage
2. browser language detection
3. English fallback

The manual language switcher always remains visible in the header.

## Hero preview behavior

The landing-page hero now uses a rotating product preview.

Scene order:

1. Slack
2. Apple Notes
3. Claude Code terminal

Behavior:

- the preview auto-rotates in that order
- each scene stays on screen for 3 seconds
- rotation pauses while the preview is hovered or focused
- reduced-motion users do not get auto-rotation
- the voice/wave icon remains persistent across scene changes
- scene labels are intentionally hidden; only the product window changes

## Current layout notes

The hero now keeps its copy focused on headline, body, and CTAs only.

The hero headline now uses a rotating-word construction so the main promise can cycle through adjacent ideas without changing the layout.

The hero mockup uses a Slack-like `#dev` thread with a wider chat pane, square coworker avatars, and staggered composer-copy animation so the product visual reads as speech turning into a live reply draft.

The Apple Notes scene is now a direct match to the screenshot in [`resources/screenshots/note-app.png`](/workspace/.worktrees/feat-github-pages-product-lp/resources/screenshots/note-app.png), including the simple two-pane list/editor layout, yellow selected note card, centered date line, and static to-do list text.

The Claude Code scene is now a direct match to the screenshot in [`resources/screenshots/claude-code.png`](/workspace/.worktrees/feat-github-pages-product-lp/resources/screenshots/claude-code.png), including the narrow top title bar, tmux-like tab row, version/model block, prompt line, and `? for shortcuts` hint.

The usage section shows isolated numbered cards without a connector rail and now surfaces the default recording shortcut visually for start/stop.

The features section now uses tighter single-line product copy that leans into workflow outcomes rather than a literal app capability checklist.

The product showcase cards stay aligned on one row at desktop widths, and the FAQ is rendered as a vertical accordion.

The product showcase is intentionally spec-driven rather than implementation-literal:

- card one visualizes running the selected profile shortcut and turning a messy instruction into a formatted prompt
- card two frames profiles as persistent reusable setups with `Email`, `Prompt`, and `Translation` fields
- card three presents the custom dictionary as a dedicated vocabulary view for names and domain terms

## Base path

The site is built for this repository’s GitHub Pages project path:

`/speech-to-text-app/`

That base path is configured in [`site/vite.config.ts`](/workspace/.worktrees/feat-github-pages-product-lp/site/vite.config.ts).
