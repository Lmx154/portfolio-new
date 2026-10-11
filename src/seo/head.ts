/**
 * Pure builders for the per-page `<head>` tags (title, description, canonical,
 * Open Graph, Twitter card, JSON-LD) of the prerendered pages. No content
 * loaders are imported here; src/entry-server.tsx passes the data in.
 */

export const SITE_URL = 'https://luisamartinez.dev';
export const SITE_NAME = 'Luis Martinez';

export type HeadPage =
  | {
      kind: 'home';
      title: string;
      description: string;
      /** Profile photo: site-relative path or absolute URL. */
      image?: string | null;
      jobTitle?: string;
      /** Profile URLs for Person.sameAs; empty entries are dropped. */
      sameAs?: string[];
    }
  | {
      kind: 'post';
      id: string;
      /** Post title without the site suffix. */
      title: string;
      description: string;
      /** Cover image: site-relative path or absolute URL. */
      image?: string | null;
      /** ISO date (YYYY-MM-DD). */
      date?: string;
      tags?: string[];
    }
  | { kind: 'notFound'; title: string; description: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute URL for a site-relative path or an already absolute/protocol-relative URL. */
export function absoluteUrl(src: string): string {
  const s = src.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  return `${SITE_URL}${s.startsWith('/') ? '' : '/'}${s.replace(/ /g, '%20')}`;
}

/** Canonical URL for a route: absolute, no trailing slash ('/' becomes the bare origin). */
export function canonicalUrl(route: string): string {
  const path = route.replace(/\/+$/, '');
  return `${SITE_URL}${path}`;
}

/** `<script type="application/ld+json">`; `<`, `>`, `&` and line separators are escaped so no `</script>` breakout is possible. */
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

const meta = (attr: 'name' | 'property', key: string, content: string) =>
  `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;

interface Common {
  title: string;
  description: string;
  type: 'website' | 'article';
  url?: string;
  image?: string;
  largeCard: boolean;
  publishedTime?: string;
}

function commonTags(c: Common): string[] {
  const tags = [
    `<title>${escapeHtml(c.title)}</title>`,
    meta('name', 'description', c.description),
  ];
  if (c.url) tags.push(`<link rel="canonical" href="${escapeHtml(c.url)}" />`);
  tags.push(
    meta('property', 'og:type', c.type),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:title', c.title),
    meta('property', 'og:description', c.description),
  );
  if (c.url) tags.push(meta('property', 'og:url', c.url));
  if (c.image) tags.push(meta('property', 'og:image', c.image));
  if (c.publishedTime) tags.push(meta('property', 'article:published_time', c.publishedTime));
  tags.push(
    meta('name', 'twitter:card', c.image && c.largeCard ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', c.title),
    meta('name', 'twitter:description', c.description),
  );
  if (c.image) tags.push(meta('name', 'twitter:image', c.image));
  return tags;
}

const join = (tags: string[]) => tags.join('\n    ');

export function buildHead(page: HeadPage): string {
  if (page.kind === 'home') {
    const url = canonicalUrl('/');
    const image = page.image ? absoluteUrl(page.image) : undefined;
    const sameAs = (page.sameAs ?? []).filter(Boolean);
    const person: Record<string, unknown> = {
      '@type': 'Person',
      '@id': `${url}/#person`,
      name: SITE_NAME,
      url,
    };
    if (page.jobTitle) person.jobTitle = page.jobTitle;
    if (image) person.image = image;
    if (sameAs.length) person.sameAs = sameAs;
    const website = { '@type': 'WebSite', '@id': `${url}/#website`, name: SITE_NAME, url };
    return join([
      ...commonTags({
        title: page.title,
        description: page.description,
        type: 'website',
        url,
        image,
        largeCard: false,
      }),
      jsonLdScript({ '@context': 'https://schema.org', '@graph': [person, website] }),
    ]);
  }

  if (page.kind === 'post') {
    const url = canonicalUrl(`/blog/${page.id}`);
    const title = `${page.title} — ${SITE_NAME}`;
    const image = page.image ? absoluteUrl(page.image) : undefined;
    const posting: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: page.title,
      description: page.description,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Person', name: SITE_NAME, url: SITE_URL },
    };
    if (page.date) {
      posting.datePublished = page.date;
      posting.dateModified = page.date;
    }
    if (image) posting.image = image;
    if (page.tags?.length) posting.keywords = page.tags.join(', ');
    return join([
      ...commonTags({
        title,
        description: page.description,
        type: 'article',
        url,
        image,
        largeCard: true,
        publishedTime: page.date,
      }),
      jsonLdScript(posting),
    ]);
  }

  return join([
    ...commonTags({
      title: page.title,
      description: page.description,
      type: 'website',
      largeCard: false,
    }),
    '<meta name="robots" content="noindex" />',
  ]);
}
