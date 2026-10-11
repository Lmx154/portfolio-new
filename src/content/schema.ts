import { z } from 'zod';

/**
 * Shared content schema for the portfolio.
 *
 * This is the single source of truth for what valid content looks like. The
 * site loaders validate against it at build time (invalid content fails the
 * build), and the local CMS will validate against the same rules before
 * saving. It is intentionally framework-agnostic so it can be lifted into a
 * shared workspace package (`packages/content-schema`) once the Tauri CMS
 * exists — keep it free of React/Vite imports.
 */

/* ------------------------------------------------------------------ blocks */

const blockBase = {
  /** Stable id used by the CMS for reorder/duplicate. Unique within a post. */
  id: z.string().min(1),
};

export const HeadingBlock = z.object({
  ...blockBase,
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  /** May contain inline markdown (e.g. **bold**, [link](url)). */
  text: z.string(),
});

export const ParagraphBlock = z.object({
  ...blockBase,
  type: z.literal('paragraph'),
  /** May contain inline markdown. */
  text: z.string(),
});

export const ImageBlock = z.object({
  ...blockBase,
  type: z.literal('image'),
  /** Relative to the post folder (assets/foo.jpg) or absolute/external. */
  src: z.string().default(''),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const VideoBlock = z.object({
  ...blockBase,
  type: z.literal('video'),
  /** Relative to the post folder (videos/foo.mp4) or absolute/external. */
  src: z.string().default(''),
  caption: z.string().optional(),
  controls: z.boolean().default(true),
  muted: z.boolean().default(false),
  autoplay: z.boolean().default(false),
  loop: z.boolean().default(false),
});

export const ListBlock = z.object({
  ...blockBase,
  type: z.literal('list'),
  ordered: z.boolean().default(false),
  /** Each item may contain inline markdown. */
  items: z.array(z.string()).min(1),
});

export const CodeBlock = z.object({
  ...blockBase,
  type: z.literal('code'),
  language: z.string().optional(),
  code: z.string(),
});

export const QuoteBlock = z.object({
  ...blockBase,
  type: z.literal('quote'),
  text: z.string(),
});

export const DividerBlock = z.object({
  ...blockBase,
  type: z.literal('divider'),
});

export const CalloutBlock = z.object({
  ...blockBase,
  type: z.literal('callout'),
  variant: z.enum(['info', 'warning', 'success', 'note']).default('info'),
  text: z.string(),
});

export const Block = z.discriminatedUnion('type', [
  HeadingBlock,
  ParagraphBlock,
  ImageBlock,
  VideoBlock,
  ListBlock,
  CodeBlock,
  QuoteBlock,
  DividerBlock,
  CalloutBlock,
]);

export type Block = z.infer<typeof Block>;
export type BlockType = Block['type'];

/* ----------------------------------------------------------------- content */

export const BlogPostSchema = z
  .object({
    type: z.literal('blog').default('blog'),
    /** URL slug; must match the folder name. */
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
    title: z.string().min(1),
    status: z.enum(['draft', 'published']).default('published'),
    /** ISO date (YYYY-MM-DD) — sortable. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
    /** Human-friendly date shown in the UI (e.g. "October 18, 2025"). */
    displayDate: z.string().optional(),
    excerpt: z.string().default(''),
    readTime: z.string().default(''),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().nullable().optional(),
    blocks: z.array(Block).default([]),
  })
  .superRefine((post, ctx) => {
    if (post.status === 'published') {
      if (!post.date) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'published posts need a date' });
      }
      if (post.blocks.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'published posts need at least one block' });
      }
    }
  });

/** One item in a project's media gallery: an image, a video, or a 3D model (GLB/STEP). */
export const MediaItemSchema = z.object({
  type: z.enum(['image', 'video', 'model']).default('image'),
  /** Public path (/foo.png, /foo.glb) or external URL. */
  src: z.string().default(''),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const ProjectSchema = z.object({
  type: z.literal('project').default('project'),
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().default('Completed'),
  /** Lower sorts first; controls card order on the homepage. */
  order: z.number().default(0),
  image: z.string().default(''),
  /** Optional STEP/GLB file (in public/) shown as an interactive 3D viewer instead of the image. */
  model3d: z.string().default(''),
  /** Optional media gallery (images/videos/3D models). When set, replaces the single image/model. */
  media: z.array(MediaItemSchema).default([]),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  github: z.string().url().nullable().optional(),
  deploymentUrl: z.string().url().nullable().optional(),
});

export const GalleryItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  src: z.string().default(''),
  alt: z.string().default(''),
  title: z.string().default(''),
  description: z.string().default(''),
  /** Optional extra images/videos for this tile. A video `src` is a local file or a YouTube URL. */
  media: z.array(MediaItemSchema).optional(),
});

export const GallerySchema = z.object({
  items: z.array(GalleryItemSchema).default([]),
});

export const VideoSchema = z.object({
  id: z.string().min(1),
  src: z.string().default(''),
  title: z.string().min(1),
  description: z.string().optional(),
  thumbnail: z.string().optional(),
  category: z.enum(['rockets', 'projects', 'demos', 'presentations']),
  date: z.string().default(''),
  duration: z.string().optional(),
  autoplay: z.boolean().default(false),
  loop: z.boolean().default(false),
  muted: z.boolean().default(true),
  controls: z.boolean().default(true),
});

export const VideosSchema = z.object({
  items: z.array(VideoSchema).default([]),
});

/* ------------------------------------------------------------------- about */

/** Icon names the About trait picker offers; rendered to SVG in About.tsx. */
export const TRAIT_ICON_NAMES = [
  'code',
  'book',
  'puzzle',
  'bolt',
  'cpu',
  'lightbulb',
  'users',
  'rocket',
  'star',
] as const;

export const TraitSchema = z.object({
  /** Name of an icon defined in the About component's icon registry. */
  icon: z.string().default('code'),
  title: z.string().min(1),
  description: z.string().default(''),
});

export const AboutListSchema = z.object({
  title: z.string().default(''),
  items: z.array(z.string()).default([]),
});

export const AboutResumeSchema = z.object({
  href: z.string().default(''),
  downloadName: z.string().default(''),
  label: z.string().default('Resume'),
});

export const AboutSchema = z.object({
  sectionTitle: z.string().default('ABOUT ME'),
  profileImage: z.string().default(''),
  profileAlt: z.string().default(''),
  paragraphs: z.array(z.string()).default([]),
  traits: z.array(TraitSchema).default([]),
  education: AboutListSchema.default({ title: '', items: [] }),
  focus: AboutListSchema.default({ title: '', items: [] }),
  resume: AboutResumeSchema.default({ href: '', downloadName: '', label: 'Resume' }),
});

/* -------------------------------------------------------------------- site */

/** A hero call-to-action button: label + the homepage section id to scroll to. */
export const CtaSchema = z.object({
  label: z.string().default(''),
  target: z.string().default(''),
});

/** External/social links used across the header, footer, and blog footer. */
export const SiteLinksSchema = z.object({
  github: z.string().default(''),
  linkedin: z.string().default(''),
  twitter: z.string().default(''),
  email: z.string().default(''),
});

export const SiteFooterSchema = z.object({
  copyright: z.string().default(''),
  rights: z.string().default(''),
});

export const SiteSchema = z.object({
  name: z.string().default(''),
  role: z.string().default(''),
  headlines: z.array(z.string()).default([]),
  ctas: z.array(CtaSchema).default([]),
  links: SiteLinksSchema.default({ github: '', linkedin: '', twitter: '', email: '' }),
  footer: SiteFooterSchema.default({ copyright: '', rights: '' }),
});

/* ------------------------------------------------------------------- types */

export type BlogPost = z.infer<typeof BlogPostSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type GalleryItem = z.infer<typeof GalleryItemSchema>;
export type Gallery = z.infer<typeof GallerySchema>;
export type Video = z.infer<typeof VideoSchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type AboutList = z.infer<typeof AboutListSchema>;
export type About = z.infer<typeof AboutSchema>;
export type Cta = z.infer<typeof CtaSchema>;
export type SiteLinks = z.infer<typeof SiteLinksSchema>;
export type Site = z.infer<typeof SiteSchema>;
