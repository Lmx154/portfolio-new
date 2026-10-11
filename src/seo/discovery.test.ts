import { describe, expect, it } from 'vitest';
import { AboutSchema, BlogPostSchema, ProjectSchema, SiteSchema, type BlogPost } from '../content/schema';
import { about } from '../data/about';
import { blogPosts } from '../data/blogPosts';
import { buildDiscoveryFiles, discoveryFiles, type DiscoveryData } from './discovery';

const post = (input: Record<string, unknown>): BlogPost => BlogPostSchema.parse(input);

const newer = post({
  id: 'newer-post',
  title: 'Newer & <Better> Post',
  date: '2026-02-03',
  excerpt: 'Newer excerpt',
  tags: ['rockets', 'avionics'],
  blocks: [
    { id: 'h', type: 'heading', level: 1, text: 'Big heading' },
    { id: 'p', type: 'paragraph', text: 'Newer paragraph text with **bold**.' },
    { id: 'i', type: 'image', src: '/content/blog/newer-post/assets/a.webp', alt: 'An image' },
  ],
});
const older = post({
  id: 'older-post',
  title: 'Older Post',
  date: '2025-01-15',
  blocks: [{ id: 'p', type: 'paragraph', text: 'Older paragraph text.' }],
});
const draft = post({
  id: 'secret-draft',
  title: 'Secret Draft Title',
  status: 'draft',
  date: '2027-01-01',
  blocks: [{ id: 'p', type: 'paragraph', text: 'Draft paragraph must not leak.' }],
});

const fixture: DiscoveryData = {
  site: SiteSchema.parse({
    name: 'JANE DOE',
    role: 'Test Engineer',
    links: { github: 'https://github.com/jane', linkedin: '', twitter: 'https://x.com/jane', email: 'jane@example.com' },
  }),
  about: AboutSchema.parse({
    paragraphs: ["I'm Jane Doe, a test engineer based in Testville. I test things.", 'Second about paragraph.'],
    education: { title: 'EDUCATION', items: ['B.S. Testing'] },
    focus: { title: 'FOCUS', items: ['Fixtures'] },
  }),
  projects: [
    ProjectSchema.parse({
      id: 'proj',
      title: 'Proj',
      status: 'In Progress',
      description: 'A project.',
      tags: ['T1'],
      github: 'https://github.com/jane/proj',
    }),
  ],
  gallery: [{ id: 1, src: '/a.jpg', alt: '', title: 'Community Event', description: 'Helped at an event' }],
  posts: [older, draft, newer],
};

const byPath = (data: DiscoveryData) => Object.fromEntries(buildDiscoveryFiles(data).map((f) => [f.path, f.contents]));

describe('discovery files (fixtures)', () => {
  const files = byPath(fixture);

  it('emits the four files', () => {
    expect(Object.keys(files)).toEqual(['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt']);
  });

  it('robots.txt is exact', () => {
    expect(files['robots.txt']).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://luisamartinez.dev/sitemap.xml\n',
    );
  });

  it('sitemap lists / and every published post with lastmod, and no drafts', () => {
    const xml = files['sitemap.xml'];
    expect(xml).toContain('<loc>https://luisamartinez.dev/</loc>\n    <lastmod>2026-02-03</lastmod>');
    expect(xml).toContain('<loc>https://luisamartinez.dev/blog/newer-post</loc>\n    <lastmod>2026-02-03</lastmod>');
    expect(xml).toContain('<loc>https://luisamartinez.dev/blog/older-post</loc>\n    <lastmod>2025-01-15</lastmod>');
    expect(xml).not.toContain('secret-draft');
    expect(xml).not.toContain('2027-01-01');
  });

  it('sitemap escapes XML entities', () => {
    const xml = buildDiscoveryFiles({
      ...fixture,
      posts: [{ ...newer, id: 'a&b' }],
    }).find((f) => f.path === 'sitemap.xml')!.contents;
    expect(xml).toContain('/blog/a&amp;b');
    expect(xml).not.toContain('/blog/a&b<');
  });

  it('llms.txt follows the llmstxt.org shape', () => {
    const txt = files['llms.txt'];
    expect(txt.startsWith('# Jane Doe\n\n> Test Engineer. ')).toBe(true);
    expect(txt).toContain("> Test Engineer. I'm Jane Doe, a test engineer based in Testville.");
    expect(txt).toContain('\nI test things.\n');
    expect(txt).toContain('- [Newer & <Better> Post](https://luisamartinez.dev/blog/newer-post): Newer excerpt');
    expect(txt).toContain('- [Older Post](https://luisamartinez.dev/blog/older-post)\n');
    expect(txt).toContain('- Proj: A project. ([GitHub](https://github.com/jane/proj))');
    expect(txt).toContain('[About Jane Doe](https://luisamartinez.dev/#about)');
    expect(txt).toContain('  - B.S. Testing');
    expect(txt).toContain('- [GitHub](https://github.com/jane)\n- [X](https://x.com/jane)\n- [Email](mailto:jane@example.com)');
    expect(txt).not.toContain('LinkedIn');
    expect(txt).toContain('## Optional\n\n- [Full content of this site](https://luisamartinez.dev/llms-full.txt)');
    expect(txt).not.toContain('Secret Draft');
    expect(txt.indexOf('Newer & <Better>')).toBeLessThan(txt.indexOf('Older Post'));
  });

  it('llms-full.txt contains every published post in full and excludes drafts', () => {
    const txt = files['llms-full.txt'];
    expect(txt.startsWith('# Jane Doe\n')).toBe(true);
    expect(txt).toContain('## Newer & <Better> Post\n\n- Date: 2026-02-03\n- Tags: rockets, avionics\n- URL: https://luisamartinez.dev/blog/newer-post');
    expect(txt).toContain('### Big heading');
    expect(txt).toContain('Newer paragraph text with **bold**.');
    expect(txt).toContain('![An image](https://luisamartinez.dev/content/blog/newer-post/assets/a.webp)');
    expect(txt).toContain('## Older Post');
    expect(txt).toContain('Older paragraph text.');
    expect(txt).toContain('Second about paragraph.');
    expect(txt).toContain('### Proj\n\n- Status: In Progress\n- Tags: T1\n- GitHub: https://github.com/jane/proj\n\nA project.');
    expect(txt).toContain('## Community involvement\n\n### Community Event\n\nHelped at an event');
    expect(txt).not.toContain('Secret Draft');
    expect(txt).not.toContain('Draft paragraph must not leak.');
    expect(txt).not.toMatch(/\n{3,}/);
  });

  it('is deterministic', () => {
    expect(byPath(fixture)).toEqual(byPath(fixture));
  });
});

describe('discoveryFiles() with real content', () => {
  const files = Object.fromEntries(discoveryFiles().map((f) => [f.path, f.contents]));

  it('sitemap has / plus every published post', () => {
    const locs = [...files['sitemap.xml'].matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs[0]).toBe('https://luisamartinez.dev/');
    expect(locs.slice(1).sort()).toEqual(blogPosts.map((p) => `https://luisamartinez.dev/blog/${p.id}`).sort());
  });

  it('llms.txt starts with an H1', () => {
    expect(files['llms.txt'].startsWith('# ')).toBe(true);
  });

  it('llms-full.txt has every published post title and paragraph, and every about paragraph', () => {
    const txt = files['llms-full.txt'];
    for (const p of blogPosts) {
      expect(txt).toContain(`## ${p.title}`);
      for (const block of p.blocks) {
        if (block.type === 'paragraph') expect(txt).toContain(block.text.trim());
      }
    }
    for (const paragraph of about.paragraphs) expect(txt).toContain(paragraph.trim());
  });
});
