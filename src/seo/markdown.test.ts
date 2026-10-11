import { describe, expect, it } from 'vitest';
import type { Block } from '../content/schema';
import { blocksToMarkdown } from './markdown';

const postUrl = 'https://luisamartinez.dev/blog/my-post';
const md = (blocks: Block[], headingOffset?: number) => blocksToMarkdown(blocks, { postUrl, headingOffset });

describe('blocksToMarkdown', () => {
  it('maps heading levels to #, ## and ###', () => {
    expect(
      md([
        { id: 'a', type: 'heading', level: 1, text: 'One' },
        { id: 'b', type: 'heading', level: 2, text: 'Two' },
        { id: 'c', type: 'heading', level: 3, text: 'Three' },
      ]),
    ).toBe('# One\n\n## Two\n\n### Three');
  });

  it('applies headingOffset', () => {
    expect(md([{ id: 'a', type: 'heading', level: 3, text: 'Deep' }], 2)).toBe('##### Deep');
  });

  it('passes paragraph inline markdown through', () => {
    expect(md([{ id: 'a', type: 'paragraph', text: 'Some **bold** and [a link](https://x.dev).' }])).toBe(
      'Some **bold** and [a link](https://x.dev).',
    );
  });

  it('renders unordered and ordered lists', () => {
    expect(md([{ id: 'a', type: 'list', ordered: false, items: ['x', 'y'] }])).toBe('- x\n- y');
    expect(md([{ id: 'a', type: 'list', ordered: true, items: ['x', 'y'] }])).toBe('1. x\n2. y');
  });

  it('fences code with its language and keeps contents verbatim', () => {
    expect(md([{ id: 'a', type: 'code', language: 'cpp', code: 'int a;\n\n\nint b;\n' }])).toBe(
      '```cpp\nint a;\n\n\nint b;\n```',
    );
    expect(md([{ id: 'a', type: 'code', code: 'x' }])).toBe('```\nx\n```');
  });

  it('uses a longer fence when the code contains backtick fences', () => {
    expect(md([{ id: 'a', type: 'code', language: 'md', code: '```js\nx\n```' }])).toBe(
      '````md\n```js\nx\n```\n````',
    );
  });

  it('renders quotes with > prefixes', () => {
    expect(md([{ id: 'a', type: 'quote', text: 'line one\n\nline two' }])).toBe('> line one\n>\n> line two');
  });

  it('renders callouts with their variant', () => {
    expect(md([{ id: 'a', type: 'callout', variant: 'warning', text: 'Careful' }])).toBe('> **Warning:** Careful');
    expect(md([{ id: 'a', type: 'callout', variant: 'note', text: 'FYI' }])).toBe('> **Note:** FYI');
  });

  it('renders dividers', () => {
    expect(md([{ id: 'a', type: 'divider' }])).toBe('---');
  });

  it('resolves post-relative image URLs against the post media folder', () => {
    expect(md([{ id: 'a', type: 'image', src: 'assets/pic one.jpg', alt: 'A pic', caption: 'Nice' }])).toBe(
      '![A pic](https://luisamartinez.dev/content/blog/my-post/assets/pic%20one.jpg)\n\n*Nice*',
    );
    expect(md([{ id: 'a', type: 'image', src: './assets/pic.jpg' }])).toBe(
      '![](https://luisamartinez.dev/content/blog/my-post/assets/pic.jpg)',
    );
  });

  it('prefixes the origin to root-relative URLs and leaves external URLs unchanged', () => {
    expect(md([{ id: 'a', type: 'image', src: '/content/blog/my-post/assets/p.webp', alt: 'p' }])).toBe(
      '![p](https://luisamartinez.dev/content/blog/my-post/assets/p.webp)',
    );
    expect(md([{ id: 'a', type: 'image', src: 'https://cdn.example.com/p.png', alt: 'p' }])).toBe(
      '![p](https://cdn.example.com/p.png)',
    );
  });

  it('renders videos as link lines, leaving YouTube URLs unchanged', () => {
    const base = { id: 'a', type: 'video' as const, controls: true, muted: false, autoplay: false, loop: false };
    expect(md([{ ...base, src: 'videos/flight.mp4', caption: 'First flight' }])).toBe(
      '[Video: First flight](https://luisamartinez.dev/content/blog/my-post/videos/flight.mp4)',
    );
    expect(md([{ ...base, src: 'https://www.youtube.com/watch?v=abc123', caption: 'Demo' }])).toBe(
      '[Video: Demo](https://www.youtube.com/watch?v=abc123)',
    );
  });

  it('drops empty media blocks and separates blocks with a single blank line', () => {
    expect(
      md([
        { id: 'a', type: 'paragraph', text: 'First\n\n\n\nstill first  ' },
        { id: 'b', type: 'image', src: '' },
        { id: 'c', type: 'paragraph', text: 'Second' },
      ]),
    ).toBe('First\n\nstill first\n\nSecond');
  });

  it('is deterministic', () => {
    const blocks: Block[] = [{ id: 'a', type: 'paragraph', text: 'x' }];
    expect(md(blocks)).toBe(md(blocks));
  });
});
