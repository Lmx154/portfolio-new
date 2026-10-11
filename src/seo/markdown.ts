import type { Block } from '../content/schema';

export type MarkdownOptions = {
  /** Canonical post URL (https://host/blog/<slug>); gives the origin and slug for resolving media. */
  postUrl: string;
  /** Added to heading levels (capped at 6) so a post can be nested under a parent heading. Default 0. */
  headingOffset?: number;
};

const CALLOUT_LABELS = {
  info: 'Info',
  warning: 'Warning',
  success: 'Success',
  note: 'Note',
} as const;

function postContext(postUrl: string): { origin: string; slug: string } {
  const url = new URL(postUrl);
  const segments = url.pathname.split('/').filter(Boolean);
  return { origin: url.origin, slug: segments[segments.length - 1] ?? '' };
}

/**
 * Resolves a block media `src` to an absolute URL. External URLs are unchanged,
 * root-relative paths (what blogPosts.ts produces, `/content/blog/<slug>/...`)
 * gain the origin, and still-relative paths resolve against the post's media folder.
 */
function absoluteUrl(src: string, origin: string, slug: string): string {
  const s = src.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${origin}${s}`;
  return `${origin}/content/blog/${slug}/${s.replace(/^\.\//, '')}`;
}

const encodeDestination = (url: string) =>
  url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

const escapeLabel = (text: string) => text.replace(/([[\]])/g, '\\$1');

const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const quote = (text: string) =>
  tidy(text)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');

function fence(code: string, language: string | undefined): string {
  const body = code.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const longestRun = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = '`'.repeat(Math.max(3, longestRun + 1));
  return `${ticks}${language?.trim() ?? ''}\n${body}\n${ticks}`;
}

function blockToMarkdown(block: Block, origin: string, slug: string, headingOffset: number): string {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, block.level + headingOffset);
      return `${'#'.repeat(level)} ${tidy(block.text).replace(/\s*\n\s*/g, ' ')}`;
    }
    case 'paragraph':
      return tidy(block.text);
    case 'list': {
      const lines = block.items.map((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : '-';
        const [first = '', ...rest] = tidy(item).split('\n');
        const indent = ' '.repeat(marker.length + 1);
        return [`${marker} ${first}`, ...rest.map((line) => (line ? indent + line : line))].join('\n');
      });
      return lines.join('\n');
    }
    case 'code':
      return fence(block.code, block.language);
    case 'quote':
      return quote(block.text);
    case 'callout':
      return quote(`**${CALLOUT_LABELS[block.variant]}:** ${tidy(block.text)}`);
    case 'divider':
      return '---';
    case 'image': {
      if (!block.src.trim()) return '';
      const image = `![${escapeLabel(block.alt ?? '')}](${encodeDestination(absoluteUrl(block.src, origin, slug))})`;
      const caption = block.caption ? tidy(block.caption) : '';
      return caption ? `${image}\n\n*${caption}*` : image;
    }
    case 'video': {
      if (!block.src.trim()) return '';
      const caption = block.caption ? tidy(block.caption).replace(/\s*\n\s*/g, ' ') : '';
      const label = caption ? `Video: ${escapeLabel(caption)}` : 'Video';
      return `[${label}](${encodeDestination(absoluteUrl(block.src, origin, slug))})`;
    }
  }
}

/**
 * Converts a post's blocks to clean, deterministic Markdown: blocks are separated
 * by one blank line, empty blocks are dropped, and media URLs are absolute.
 * Paragraph/list/heading text is already inline markdown and passes through.
 */
export function blocksToMarkdown(blocks: readonly Block[], options: MarkdownOptions): string {
  const { origin, slug } = postContext(options.postUrl);
  const headingOffset = options.headingOffset ?? 0;
  return blocks
    .map((block) => blockToMarkdown(block, origin, slug, headingOffset))
    .filter((chunk) => chunk !== '')
    .join('\n\n');
}
