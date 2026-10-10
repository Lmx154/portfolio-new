import { marked } from 'marked';
import type { Block } from '../content/schema';
import ClickableImage from './ClickableImage';
import Video from './Video';

/**
 * Renders an ordered list of content blocks. This is the single place that
 * turns structured JSON content into UI — shared by every block-based page
 * (blog posts today; projects/other docs later). The local CMS edits the
 * blocks; this component owns how they look.
 *
 * Media `src` values are expected to be already resolved to public URLs by the
 * content loader (see src/data/blogPosts.ts), so blocks here are render-ready.
 */

// Inline markdown (**bold**, *italic*, [links]) is rendered to HTML at render
// time. Content is single-author and trusted, so dangerouslySetInnerHTML is
// acceptable here — the CMS never lets an untrusted party author blocks.
const inline = (text: string): { __html: string } => ({
  __html: marked.parseInline(text) as string,
});

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'font-display text-3xl sm:text-4xl font-light text-white mt-14 mb-6 tracking-tight first:mt-0',
  2: 'font-display text-2xl sm:text-3xl font-light text-white mt-12 mb-5 tracking-tight first:mt-0',
  3: 'font-display text-xl sm:text-2xl font-light text-white mt-10 mb-4 tracking-tight first:mt-0',
};

const CALLOUT_CLASS: Record<NonNullable<Extract<Block, { type: 'callout' }>['variant']>, string> = {
  info: 'border-l-sky-400/70 text-sky-100',
  note: 'border-l-white/40 text-neutral-200',
  success: 'border-l-emerald-400/70 text-emerald-100',
  warning: 'border-l-amber-400/70 text-amber-100',
};

function renderBlock(block: Block) {
  switch (block.type) {
    case 'heading': {
      const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3');
      return <Tag key={block.id} className={HEADING_CLASS[block.level]} dangerouslySetInnerHTML={inline(block.text)} />;
    }

    case 'paragraph':
      return (
        <p
          key={block.id}
          className="text-neutral-200 leading-relaxed font-light mb-6 text-[17px] max-w-[68ch]"
          dangerouslySetInnerHTML={inline(block.text)}
        />
      );

    case 'image':
      return (
        <div key={block.id} className="my-12 flex flex-col items-center">
          <ClickableImage
            src={block.src}
            alt={block.alt || ''}
            className="max-w-md w-full h-auto border border-white/10 mx-auto"
          />
          {(block.caption || block.alt) && (
            <p className="text-neutral-500 text-sm font-light mt-3 text-center max-w-md">
              {block.caption || block.alt}
            </p>
          )}
        </div>
      );

    case 'video':
      return (
        <div key={block.id} className="my-12 flex justify-center">
          <Video
            src={block.src}
            caption={block.caption}
            autoplay={block.autoplay}
            loop={block.loop}
            muted={block.muted}
            controls={block.controls}
            className="max-w-md w-full h-auto"
          />
        </div>
      );

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          key={block.id}
          className={`mb-6 space-y-2 text-neutral-200 font-light text-[17px] max-w-[68ch] ${
            block.ordered ? 'list-decimal' : 'list-disc'
          } list-outside pl-6 marker:text-neutral-500`}
        >
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={inline(item)} />
          ))}
        </ListTag>
      );
    }

    case 'code':
      return (
        <pre
          key={block.id}
          className="my-8 overflow-x-auto border border-white/10 bg-black/60 p-4"
        >
          {block.language && (
            <div className="label-mono text-signal/70 mb-3">{block.language}</div>
          )}
          <code className="font-mono text-sm text-neutral-200">{block.code}</code>
        </pre>
      );

    case 'quote':
      return (
        <blockquote
          key={block.id}
          className="my-8 border-l-2 border-signal/60 pl-6 italic text-neutral-200 font-light text-[17px] max-w-[68ch]"
          dangerouslySetInnerHTML={inline(block.text)}
        />
      );

    case 'divider':
      return <hr key={block.id} className="my-12 border-white/10 [border-image:linear-gradient(to_right,rgba(255,255,255,0.18),transparent)_1]" />;

    case 'callout':
      return (
        <div
          key={block.id}
          className={`glass border-l-2 my-8 p-4 ${CALLOUT_CLASS[block.variant]}`}
        >
          <div className="label-mono mb-2">{block.variant}</div>
          <div className="font-light leading-relaxed" dangerouslySetInnerHTML={inline(block.text)} />
        </div>
      );

    default:
      return null;
  }
}

const BlockRenderer = ({ blocks }: { blocks: Block[] }) => <>{blocks.map(renderBlock)}</>;

export default BlockRenderer;
