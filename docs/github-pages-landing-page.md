<!--
Where: docs/github-pages-landing-page.md
What: Local development and deployment guide for the Dicta landing page.
Why: Keep the GitHub Pages site workflow explicit and maintainable alongside the Electron app.
-->

# Dicta Landing Page

The landing page lives in [`site/`](/workspace/.worktrees/feat-github-pages-product-lp/site).

## Local development

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

## Base path

The site is built for this repository’s GitHub Pages project path:

`/speech-to-text-app/`

That base path is configured in [`site/vite.config.ts`](/workspace/.worktrees/feat-github-pages-product-lp/site/vite.config.ts).
