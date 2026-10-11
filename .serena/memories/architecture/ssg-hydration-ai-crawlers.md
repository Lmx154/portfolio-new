# SSG + hydration for AI crawlers (architect decision 2026-10-10, M6)

Full ADR: codebase-memory project `portfolio-deep-sky` (worktree of this repo, the only indexed copy), ADR-001.

Decision: Option A, build-time prerender + hydrateRoot (Vite's documented pre-render pattern, no new deps).
- build: `vite build && vite build --ssr src/entry-server.tsx --outDir dist-ssr && node scripts/prerender.mjs`. Render MUST run the package `build` script.
- Server render: renderToPipeableStream + onAllReady (renderToString drops the lazy BlogPost into its fallback).
- Route-marker contract: `<div id="root" data-prerendered-route="<key>">`. Client hydrates iff not ?spacelab AND marker === routeKey(pathname) (trailing slash stripped). Otherwise createRoot. Dev/CMS preview has no marker, so createRoot.
- vite.config.ts must branch on isSsrBuild: the SSR build must NOT inherit rollupOptions.input (index.html), manualChunks {three} (Rollup errors on externals), or the static-copy plugin.
- Render-time browser access forbidden in the shared tree. Known fixes: App.tsx isSpacelab() moved to the client entry; Header.tsx useState(() => window.scrollY) becomes useState(false); LocalClock useState(readout) gets a deterministic placeholder; SpaceBackgroundLazy uses a client-only mount gate; ScrollToTop skips scrollTo(0) on first mount.
- Generated robots.txt / sitemap.xml / llms.txt / llms-full.txt / 404.html go to dist only, never public/ (CMS media scanner, cms/src/api.ts:302).
- Verification tiers: vitest (determinism + generators), prerender build assertions (content presence, no drafts, JSON-LD valid), browser gate (no `[hydrate]` errors, #root first-child node identity preserved), post-deploy curl (Render serving). Do not claim "bots can read the site" before the post-deploy curl passes.
- Live probes 2026-10-10: Render rewrites every extension-less unknown path to index.html (200 soft-404). Missing .txt/.png/.html give a plain-text 404; missing .xml/.webp also rewrite to HTML. No UA blocking for GPTBot/ClaudeBot/PerplexityBot/CCBot etc. HTML cache s-maxage=300 (use ?v=<ts> to bust). /_redirects is Netlify syntax, inert on Render and served publicly.
- Owner step after verified deploy: delete the dashboard `/*` to `/index.html` rewrite so unknown paths return dist/404.html (verify the status is 404).
