import type { About, BlogPost, GalleryItem, Project, Site } from '../content/schema';
import { about } from '../data/about';
import { blogPosts } from '../data/blogPosts';
import { galleryItems } from '../data/gallery';
import { projects } from '../data/projects';
import { site } from '../data/site';
import { blocksToMarkdown } from './markdown';

/**
 * Crawler discovery files (robots.txt, sitemap.xml, llms.txt, llms-full.txt),
 * generated at build time from the same content loaders the site renders.
 * Redeclared (structurally identical) rather than imported from entry-server,
 * which would pull the whole React tree into this module.
 */
export type DiscoveryFile = { path: string; contents: string };

export const SITE_URL = 'https://luisamartinez.dev';

export type DiscoveryData = {
  site: Site;
  about: About;
  projects: readonly Project[];
  gallery: readonly GalleryItem[];
  /** Drafts are filtered out here, so callers may pass the unfiltered list. */
  posts: readonly BlogPost[];
};

const postUrl = (post: BlogPost) => `${SITE_URL}/blog/${post.id}`;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const titleCase = (value: string) =>
  oneLine(value)
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());

const sentenceCase = (value: string) => {
  const text = oneLine(value).toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const sentences = (text: string) => oneLine(text).split(/(?<=[.!?])\s+(?=[A-Z"'])/);

const absolute = (href: string) => (/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `${SITE_URL}${href.startsWith('/') ? '' : '/'}${href}`);

function publishedPosts(posts: readonly BlogPost[]): BlogPost[] {
  return posts
    .filter((post) => post.status === 'published')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}

function siteLinks(data: DiscoveryData): { label: string; url: string }[] {
  const { github, linkedin, twitter, email } = data.site.links;
  return [
    { label: 'GitHub', url: github },
    { label: 'LinkedIn', url: linkedin },
    { label: 'X', url: twitter },
    { label: 'Email', url: email ? `mailto:${email}` : '' },
  ].filter((link) => link.url.trim() !== '');
}

function projectLinks(project: Project): string[] {
  const links: string[] = [];
  if (project.github) links.push(`[GitHub](${project.github})`);
  if (project.deploymentUrl) links.push(`[Demo](${project.deploymentUrl})`);
  return links;
}

export function buildRobotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

export function buildSitemapXml(posts: readonly BlogPost[]): string {
  const published = publishedPosts(posts);
  const newest = published.map((post) => post.date ?? '').filter(Boolean)[0];
  const entry = (loc: string, lastmod: string | undefined) =>
    [
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
      '  </url>',
    ].join('\n');
  const urls = [
    entry(`${SITE_URL}/`, newest),
    ...published.map((post) => entry(postUrl(post), post.date)),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function header(data: DiscoveryData): string[] {
  const name = titleCase(data.site.name);
  const [first, second] = sentences(data.about.paragraphs[0] ?? '');
  const summary = [data.site.role.trim(), first].filter(Boolean).join('. ').replace(/\.\.$/, '.');
  return [
    `# ${name}`,
    ...(summary ? ['', `> ${summary}`] : []),
    ...(second ? ['', second] : []),
  ];
}

function listItems(title: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return [`- ${sentenceCase(title) || 'Details'}:`, ...items.map((item) => `  - ${oneLine(item)}`)];
}

export function buildLlmsTxt(data: DiscoveryData): string {
  const posts = publishedPosts(data.posts);
  const lines: string[] = [...header(data)];

  if (posts.length > 0) {
    lines.push('', '## Blog', '');
    for (const post of posts) {
      const excerpt = oneLine(post.excerpt);
      lines.push(`- [${oneLine(post.title).replace(/[[\]]/g, '\\$&')}](${postUrl(post)})${excerpt ? `: ${excerpt}` : ''}`);
    }
  }

  if (data.projects.length > 0) {
    lines.push('', '## Projects', '');
    for (const project of data.projects) {
      const description = oneLine(project.description);
      const links = projectLinks(project);
      lines.push(
        `- ${oneLine(project.title)}${description ? `: ${description}` : ''}${links.length ? ` (${links.join(', ')})` : ''}`,
      );
    }
  }

  lines.push('', '## About', '', `- [About ${titleCase(data.site.name)}](${SITE_URL}/#about)`);
  lines.push(...listItems(data.about.education.title, data.about.education.items));
  lines.push(...listItems(data.about.focus.title, data.about.focus.items));

  const links = siteLinks(data);
  if (links.length > 0) {
    lines.push('', '## Contact', '', ...links.map((link) => `- [${link.label}](${link.url})`));
  }

  lines.push('', '## Optional', '', `- [Full content of this site](${SITE_URL}/llms-full.txt): all projects and every blog post in full`);
  return `${lines.join('\n')}\n`;
}

export function buildLlmsFullTxt(data: DiscoveryData): string {
  const posts = publishedPosts(data.posts);
  const lines: string[] = [...header(data)];

  lines.push('', '## About', '');
  data.about.paragraphs.forEach((paragraph, index) => {
    if (index > 0) lines.push('');
    lines.push(paragraph.trim());
  });
  if (data.about.traits.length > 0) {
    lines.push('', ...data.about.traits.map((t) => `- ${oneLine(t.title)}${t.description ? `: ${oneLine(t.description)}` : ''}`));
  }
  const education = listItems(data.about.education.title, data.about.education.items);
  const focus = listItems(data.about.focus.title, data.about.focus.items);
  if (education.length || focus.length) lines.push('', ...education, ...focus);
  if (data.about.resume.href) {
    lines.push('', `- [${oneLine(data.about.resume.label) || 'Resume'}](${absolute(data.about.resume.href)})`);
  }
  const links = siteLinks(data);
  if (links.length > 0) lines.push('', ...links.map((link) => `- [${link.label}](${link.url})`));

  if (data.projects.length > 0) {
    lines.push('', '## Projects');
    for (const project of data.projects) {
      lines.push('', `### ${oneLine(project.title)}`, '');
      if (project.status) lines.push(`- Status: ${oneLine(project.status)}`);
      if (project.tags.length > 0) lines.push(`- Tags: ${project.tags.map(oneLine).join(', ')}`);
      if (project.github) lines.push(`- GitHub: ${project.github}`);
      if (project.deploymentUrl) lines.push(`- Demo: ${project.deploymentUrl}`);
      if (project.description) lines.push('', project.description.trim());
    }
  }

  if (data.gallery.length > 0) {
    lines.push('', '## Community involvement');
    for (const item of data.gallery) {
      lines.push('', `### ${oneLine(item.title) || 'Untitled'}`);
      if (item.description.trim()) lines.push('', item.description.trim());
    }
  }

  for (const post of posts) {
    const url = postUrl(post);
    lines.push('', `## ${oneLine(post.title)}`, '');
    if (post.date) lines.push(`- Date: ${post.date}`);
    if (post.tags.length > 0) lines.push(`- Tags: ${post.tags.map(oneLine).join(', ')}`);
    lines.push(`- URL: ${url}`);
    const body = blocksToMarkdown(post.blocks, { postUrl: url, headingOffset: 2 });
    if (body) lines.push('', body);
  }

  return `${lines.join('\n')}\n`;
}

/** Core generator: takes all content as parameters so it can be tested with fixtures. */
export function buildDiscoveryFiles(data: DiscoveryData): DiscoveryFile[] {
  return [
    { path: 'robots.txt', contents: buildRobotsTxt() },
    { path: 'sitemap.xml', contents: buildSitemapXml(data.posts) },
    { path: 'llms.txt', contents: buildLlmsTxt(data) },
    { path: 'llms-full.txt', contents: buildLlmsFullTxt(data) },
  ];
}

/** The discovery files for the real site content (bound to the production loaders). */
export function discoveryFiles(): DiscoveryFile[] {
  return buildDiscoveryFiles({ site, about, projects, gallery: galleryItems, posts: blogPosts });
}
