// Build-time prerender (ADR-001), the last step of `pnpm build`:
//   vite build                                             -> dist/ (client)
//   vite build --ssr src/entry-server.tsx --outDir dist-ssr -> dist-ssr/entry-server.js
//   node scripts/prerender.mjs                             -> static HTML in dist/
//
// Placeholder mechanism. The template is the client build's dist/index.html.
//   - The region from `<!--app-head-->` through `<!--/app-head-->` in <head> (default
//     home tags for `vite dev`) is replaced by head(route).
//   - The literal `<div id="root"></div>` (exactly once) is replaced by
//     `<div id="root" data-prerendered-route="<route>">` + render(route) + `</div>`.
// index.html keeps an empty root, so `vite dev` and the CMS preview are unchanged
// (no marker, so the client uses createRoot). The template is overwritten by the
// "/" page, so this script only runs after a fresh `vite build`.
//
// Outputs: dist/index.html ("/"), dist/blog/<id>/index.html (each published
// post), dist/404.html ("/404", noindex), plus discoveryFiles(). The checks at
// the end fail the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

// The client bundle ships production React; render with the same build.
process.env.NODE_ENV ??= 'production';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const blogDir = path.join(root, 'src', 'content', 'blog');

const HEAD_START = '<!--app-head-->';
const HEAD_END = '<!--/app-head-->';
const ROOT_PLACEHOLDER = '<div id="root"></div>';

const { render, routes, head, discoveryFiles } = await import(
  pathToFileURL(path.join(root, 'dist-ssr', 'entry-server.js')).href
);

const count = (haystack, needle) => haystack.split(needle).length - 1;
const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function fileForRoute(route) {
  if (route === '/') return 'index.html';
  if (route === '/404') return '404.html';
  return `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
}

/* ---------------------------------------------------------------- render */

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const headStart = template.indexOf(HEAD_START);
const headEnd = template.indexOf(HEAD_END);
if (
  count(template, HEAD_START) !== 1 ||
  count(template, HEAD_END) !== 1 ||
  headEnd < headStart ||
  count(template, ROOT_PLACEHOLDER) !== 1
) {
  console.error(
    `[prerender] dist/index.html must contain ${HEAD_START} ... ${HEAD_END} and ${ROOT_PLACEHOLDER} exactly once. ` +
      'Run the full `pnpm build` (the template is consumed by a previous prerender).',
  );
  process.exit(1);
}

const pages = [];
for (const route of routes()) {
  const appHtml = await render(route);
  const html = (template.slice(0, headStart) + head(route) + template.slice(headEnd + HEAD_END.length))
    .replace(
      ROOT_PLACEHOLDER,
      () => `<div id="root" data-prerendered-route="${escapeAttr(route)}">${appHtml}</div>`,
    );
  const file = path.join(dist, fileForRoute(route));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  pages.push({ route, file });
}

for (const { path: rel, contents } of discoveryFiles()) {
  const file = path.resolve(dist, rel);
  if (!file.startsWith(dist + path.sep)) throw new Error(`[prerender] discovery file escapes dist/: ${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/* ---------------------------------------------------------------- checks */

const failures = [];
const fail = (message) => failures.push(message);

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

const normalise = (text) => text.replace(/\s+/g, ' ').trim();

/** Visible text of an HTML fragment: comments and tags dropped, entities decoded, whitespace collapsed. */
const plainText = (html) =>
  normalise(decodeEntities(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')));

/** Text that inline-markdown blocks render to (BlockRenderer uses marked.parseInline). */
const inlineText = (markdown) => plainText(marked.parseInline(markdown));

/** The rendered app inside #root of a written page (excludes <head>). */
function bodyText(html) {
  const start = html.indexOf('<div id="root" data-prerendered-route=');
  const end = html.lastIndexOf('</body>');
  return plainText(html.slice(start, end === -1 ? undefined : end));
}

function walkHtml(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkHtml(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

const SITE_ORIGIN = 'https://luisamartinez.dev';

/** Exactly one canonical link with the expected absolute URL, and og:url equal to it. */
function checkCanonical(route, html, expected) {
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  if (canonicals.length !== 1) {
    fail(`${route}: expected exactly one canonical link, found ${canonicals.length}`);
  } else if (canonicals[0] !== expected) {
    fail(`${route}: canonical is "${canonicals[0]}", expected "${expected}"`);
  }
  const ogUrls = [...html.matchAll(/<meta property="og:url" content="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  if (ogUrls.length !== 1 || ogUrls[0] !== (canonicals[0] ?? expected)) {
    fail(`${route}: og:url (${ogUrls.join(', ') || 'missing'}) does not equal canonical`);
  }
}

// Raw post JSON, independent of the site's loader.
const rawPosts = fs
  .readdirSync(blogDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(blogDir, entry.name, 'index.json')))
  .map((entry) => {
    const json = JSON.parse(fs.readFileSync(path.join(blogDir, entry.name, 'index.json'), 'utf8'));
    return { ...json, id: json.id ?? entry.name };
  });
const published = rawPosts.filter((post) => post.status !== 'draft');
const drafts = rawPosts.filter((post) => post.status === 'draft');

// 1. Every published post has a page with its marker, title and the text of every text block.
for (const post of published) {
  const route = `/blog/${post.id}`;
  const file = path.join(dist, fileForRoute(route));
  if (!fs.existsSync(file)) {
    fail(`${route}: missing ${path.relative(root, file)}`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (count(html, `data-prerendered-route="${escapeAttr(route)}"`) !== 1) {
    fail(`${route}: route marker missing or repeated`);
  }
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!titleTag || normalise(decodeEntities(titleTag[1])) !== normalise(`${post.title} — Luis Martinez`)) {
    fail(`${route}: <title> is not "${post.title} — Luis Martinez"`);
  }
  checkCanonical(route, html, `${SITE_ORIGIN}${route}`);
  const text = bodyText(html);
  if (!text.includes(normalise(post.title))) fail(`${route}: title text not in page`);
  for (const block of post.blocks ?? []) {
    const expected =
      block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote' || block.type === 'callout'
        ? [inlineText(block.text ?? '')]
        : block.type === 'list'
          ? (block.items ?? []).map(inlineText)
          : block.type === 'code'
            ? [normalise(block.code ?? '')]
            : [];
    for (const snippet of expected) {
      if (!text.includes(snippet)) fail(`${route}: ${block.type} block ${block.id} text not in page: "${snippet.slice(0, 80)}"`);
    }
  }
}

// 2. Home and 404 pages carry their markers; 404 is noindex.
for (const [route, extra] of [['/', null], ['/404', '<meta name="robots" content="noindex" />']]) {
  const file = path.join(dist, fileForRoute(route));
  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (count(html, `data-prerendered-route="${route}"`) !== 1) fail(`${route}: route marker missing or repeated in ${fileForRoute(route)}`);
  if (extra && !html.includes(extra)) fail(`${route}: missing ${extra}`);
  if (route === '/') {
    checkCanonical(route, html, SITE_ORIGIN);
    if (!html.includes('application/ld+json')) fail('/: no JSON-LD block');
  } else if (html.includes('rel="canonical"')) {
    fail(`${route}: must not have a canonical link`);
  }
}

// 3 + 4. No leftover placeholders and no draft id anywhere in dist/**/*.html.
const draftPatterns = drafts.map((post) => ({
  id: post.id,
  pattern: new RegExp(`(^|[^a-z0-9-])${post.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9-])`),
}));
for (const file of walkHtml(dist)) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  if (html.includes('<!--app-') || html.includes('<!--/app-')) fail(`${rel}: leftover <!--app-…--> placeholder`);
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail(`${rel}: invalid JSON-LD (${error.message})`);
    }
  }
  if (count(html, 'application/ld+json') !== count(html, '<script type="application/ld+json">')) {
    fail(`${rel}: malformed application/ld+json script tag`);
  }
  for (const { id, pattern } of draftPatterns) {
    if (pattern.test(html)) fail(`${rel}: contains draft post id "${id}"`);
  }
}

// 4b. The discovery files (sitemap, llms.txt, …) must not mention a draft either.
for (const name of fs.readdirSync(dist).filter((f) => /\.(txt|xml)$/.test(f))) {
  const text = fs.readFileSync(path.join(dist, name), 'utf8');
  for (const { id, pattern } of draftPatterns) {
    if (pattern.test(text)) fail(`dist/${name}: contains draft post id "${id}"`);
  }
}

if (failures.length) {
  console.error(`[prerender] ${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}

console.log(
  `[prerender] wrote ${pages.length} pages (${pages.map((p) => p.route).join(', ')}); ` +
    `checked ${published.length} published post(s), ${drafts.length} draft(s).`,
);
