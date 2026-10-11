import { afterEach, describe, expect, it, vi } from 'vitest';
import { marked } from 'marked';
import { render } from './entry-server';
import { blogPosts } from './data/blogPosts';

// Same escaping React applies to text children.
const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const post = blogPosts.find((p) => p.id === 'marv-v2')!;
const firstParagraph = post.blocks.find((b) => b.type === 'paragraph') as { text: string };

afterEach(() => {
  vi.useRealTimers();
});

describe('prerender determinism', () => {
  it.each([
    ['/', escapeText(post.title)],
    ['/blog/marv-v2', marked.parseInline(firstParagraph.text) as string],
  ])('render(%s) is byte-identical at different system times and contains post text', async (url, postText) => {
    vi.setSystemTime(new Date('2026-01-01T03:04:05Z'));
    const first = await render(url);
    vi.setSystemTime(new Date('2031-07-15T18:59:30Z'));
    const second = await render(url);

    expect(second).toBe(first);
    expect(first).toContain(postText);
  });
});
