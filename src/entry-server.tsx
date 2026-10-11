import { StrictMode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { Writable } from 'node:stream';
import { Site } from './App';
import { about } from './data/about';
import { blogPosts } from './data/blogPosts';
import { site } from './data/site';
import { buildHead } from './seo/head';
import { discoveryFiles as buildDiscoveryFileList } from './seo/discovery';

/**
 * Server entry for the build-time prerender (ADR-001). Built by
 * `vite build --ssr src/entry-server.tsx --outDir dist-ssr` and driven by
 * scripts/prerender.mjs. It uses the same Zod content loaders as the browser
 * bundle, so draft filtering is identical in both.
 */

/** Every route that gets a static HTML file: home, each published post, and the 404 page. */
export function routes(): string[] {
  return ['/', ...blogPosts.map((post) => `/blog/${post.id}`), '/404'];
}

/**
 * Renders `url` to the HTML that goes inside `<div id="root">`. Waits for every
 * Suspense boundary (onAllReady), so the lazily loaded BlogPost is rendered in
 * full rather than as its fallback. Any render error rejects, failing the build.
 */
export function render(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let renderError: unknown;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final(callback) {
        if (renderError) reject(renderError);
        else resolve(Buffer.concat(chunks).toString('utf8'));
        callback();
      },
    });

    const stream = renderToPipeableStream(
      <StrictMode>
        <StaticRouter location={url}>
          <Site />
        </StaticRouter>
      </StrictMode>,
      {
        onAllReady() {
          stream.pipe(sink);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          renderError ??= error;
        },
      },
    );
  });
}

const SITE_TITLE = 'Luis Martinez - Avionics & Software Engineer';
const SITE_DESCRIPTION =
  'Luis Martinez — avionics and software engineer building flight software, embedded hardware and GNC systems.';

/**
 * Tags for `<head>` of the prerendered file for `route`, as one HTML string
 * (substituted for the `<!--app-head-->` region in index.html). See src/seo/head.ts.
 */
export function head(route: string): string {
  if (route === '/') {
    return buildHead({
      kind: 'home',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      image: about.profileImage,
      jobTitle: site.role,
      sameAs: [site.links.github, site.links.linkedin, site.links.twitter],
    });
  }
  if (route === '/404') {
    return buildHead({ kind: 'notFound', title: SITE_TITLE, description: SITE_DESCRIPTION });
  }
  const post = blogPosts.find((p) => `/blog/${p.id}` === route);
  if (post) {
    return buildHead({
      kind: 'post',
      id: post.id,
      title: post.title,
      description: post.excerpt || SITE_DESCRIPTION,
      image: post.coverImage,
      date: post.date,
      tags: post.tags,
    });
  }
  throw new Error(`[prerender] head(): no head for unknown route "${route}"`);
}

/** A generated file written into dist/ at `path` (relative, forward slashes). */
export type DiscoveryFile = { path: string; contents: string };

/** Crawler discovery files (robots.txt, sitemap.xml, llms.txt, llms-full.txt) to write into dist/. */
export function discoveryFiles(): DiscoveryFile[] {
  return buildDiscoveryFileList();
}
