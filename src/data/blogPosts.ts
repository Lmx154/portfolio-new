import { BlogPostSchema, compareBlogPostOrder, type BlogPost } from '../content/schema';

export type { BlogPost };

/**
 * Loads blog posts from JSON at build time, validates each against the shared
 * Zod schema, and resolves colocated media paths to public URLs.
 *
 * Validation here is the build-time safety net: a malformed or schema-violating
 * post throws and fails `vite build`, so broken content can never ship. Drafts
 * are visible during `vite dev` (for CMS preview) and excluded from production.
 */

const modules = import.meta.glob('../content/blog/*/index.json', { eager: true });

function isExternal(src: string): boolean {
  const s = src.trim();
  return s.startsWith('/') || /^(?:[a-z]+:)?\/\//i.test(s) || s.startsWith('data:');
}

/** Rewrite a post-relative media path (assets/.., videos/..) to its public URL. */
function resolveMedia(src: string | null | undefined, slug: string): string {
  if (!src) return src ?? '';
  const s = src.trim();
  if (isExternal(s)) return s;
  return `/content/blog/${slug}/${s.replace(/^\.\//, '')}`;
}

function slugFromPath(path: string): string {
  return path.replace(/\\/g, '/').match(/blog\/([^/]+)\/index\.json$/)?.[1] ?? 'unknown';
}

const loaded: BlogPost[] = [];

for (const [path, mod] of Object.entries(modules)) {
  const slug = slugFromPath(path);
  const raw = (mod as { default: unknown }).default;

  const result = BlogPostSchema.safeParse(raw);
  if (!result.success) {
    const message = `[content] Invalid blog post "${slug}":\n${result.error.message}`;
    // Fail loudly in production builds; warn (don't crash the dev server) in dev.
    if (import.meta.env.PROD) throw new Error(message);
    console.error(message);
    continue;
  }

  const post = result.data;
  loaded.push({
    ...post,
    coverImage: post.coverImage ? resolveMedia(post.coverImage, slug) : post.coverImage,
    blocks: post.blocks.map((block) =>
      'src' in block ? { ...block, src: resolveMedia(block.src, slug) } : block,
    ),
  });
}

// Published-only in production; keep drafts visible during local development.
const visible = import.meta.env.PROD ? loaded.filter((p) => p.status === 'published') : loaded;

visible.sort((a, b) => compareBlogPostOrder(a, b) || a.id.localeCompare(b.id));

export const blogPosts: BlogPost[] = visible;
