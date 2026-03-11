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

## Current layout notes

The hero now keeps its copy focused on headline, body, and CTAs only.

The hero headline now uses a rotating-word construction so the main promise can cycle through adjacent ideas without changing the layout.

The hero mockup uses a Slack-like `#dev` thread with a wider chat pane, square coworker avatars, and staggered composer-copy animation so the product visual reads as speech turning into a live reply draft.

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
