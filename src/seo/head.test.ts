import { describe, expect, it } from 'vitest';
import { absoluteUrl, buildHead, canonicalUrl, jsonLdScript } from './head';

const nasty = 'Tom & "Jerry" <b>';

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

const post = (extra = {}) =>
  buildHead({ kind: 'post', id: 'a-post', title: nasty, description: nasty, ...extra });

describe('canonical urls', () => {
  it('is absolute with no trailing slash', () => {
    expect(canonicalUrl('/')).toBe('https://luisamartinez.dev');
    expect(canonicalUrl('/blog/x/')).toBe('https://luisamartinez.dev/blog/x');
    expect(post()).toContain('<link rel="canonical" href="https://luisamartinez.dev/blog/a-post" />');
    expect(post()).toContain('<meta property="og:url" content="https://luisamartinez.dev/blog/a-post" />');
  });

  it('resolves images to absolute urls', () => {
    expect(absoluteUrl('/content/blog/x/assets/a b.webp')).toBe(
      'https://luisamartinez.dev/content/blog/x/assets/a%20b.webp',
    );
    expect(absoluteUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
  });
});

describe('escaping', () => {
  it('escapes quotes, ampersands and angle brackets in title and description', () => {
    const html = post();
    expect(html).toContain('<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt; — Luis Martinez</title>');
    expect(html).toContain('<meta name="description" content="Tom &amp; &quot;Jerry&quot; &lt;b&gt;" />');
    expect(html).toContain('<meta property="og:title" content="Tom &amp; &quot;Jerry&quot; &lt;b&gt; — Luis Martinez" />');
    expect(html).not.toMatch(/content="[^"]*<b>/);
  });

  it('keeps JSON-LD from breaking out of the script element', () => {
    const html = post({ description: '</script><script>alert(1)</script>', tags: ['</script>'] });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html.match(/<script/g)).toHaveLength(1);
    const [ld] = jsonLdBlocks(html) as { description: string; keywords: string }[];
    expect(ld.description).toBe('</script><script>alert(1)</script>');
    expect(ld.keywords).toBe('</script>');
    const out = jsonLdScript({ a: '<>&\u2028' });
    const inner = out.slice(out.indexOf('>') + 1, out.lastIndexOf('<'));
    for (const ch of ['<', '>', '&', '\u2028']) expect(inner).not.toContain(ch);
  });
});

describe('post head', () => {
  it('has article metadata and BlogPosting JSON-LD with the cover image', () => {
    const html = post({ image: '/content/blog/a-post/assets/c.webp', date: '2026-09-19', tags: ['A', 'B'] });
    const img = 'https://luisamartinez.dev/content/blog/a-post/assets/c.webp';
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain(`<meta property="og:image" content="${img}" />`);
    expect(html).toContain('<meta property="article:published_time" content="2026-09-19" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(jsonLdBlocks(html)[0]).toMatchObject({
      '@type': 'BlogPosting',
      headline: nasty,
      datePublished: '2026-09-19',
      dateModified: '2026-09-19',
      image: img,
      keywords: 'A, B',
      url: 'https://luisamartinez.dev/blog/a-post',
      author: { '@type': 'Person', name: 'Luis Martinez' },
    });
  });

  it('without a cover has no og:image or twitter:image and uses the summary card', () => {
    for (const image of [undefined, null, '']) {
      const html = post({ image });
      expect(html).not.toContain('og:image');
      expect(html).not.toContain('twitter:image');
      expect(html).toContain('<meta name="twitter:card" content="summary" />');
      expect(jsonLdBlocks(html)[0]).not.toHaveProperty('image');
    }
  });
});

describe('home and 404 heads', () => {
  const home = buildHead({
    kind: 'home',
    title: 'T',
    description: 'D',
    image: '/profile.jpg',
    jobTitle: 'Engineer',
    sameAs: ['https://github.com/x', '', 'https://x.com/x'],
  });

  it('home has Person and WebSite JSON-LD with only the present sameAs links', () => {
    expect(home).toContain('<link rel="canonical" href="https://luisamartinez.dev" />');
    expect(home).toContain('<meta property="og:type" content="website" />');
    expect(home).toContain('<meta name="twitter:card" content="summary" />');
    const [ld] = jsonLdBlocks(home) as { '@graph': Record<string, unknown>[] }[];
    const person = ld['@graph'].find((n) => n['@type'] === 'Person');
    expect(person).toMatchObject({
      name: 'Luis Martinez',
      jobTitle: 'Engineer',
      image: 'https://luisamartinez.dev/profile.jpg',
      sameAs: ['https://github.com/x', 'https://x.com/x'],
    });
    expect(ld['@graph'].find((n) => n['@type'] === 'WebSite')).toMatchObject({
      url: 'https://luisamartinez.dev',
    });
  });

  it('404 is noindex with no canonical, og:url or JSON-LD', () => {
    const html = buildHead({ kind: 'notFound', title: 'T', description: 'D' });
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('canonical');
    expect(html).not.toContain('og:url');
    expect(html).not.toContain('ld+json');
  });
});
