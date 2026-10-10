import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { ZodType } from 'zod';
import {
  BlogPostSchema,
  ProjectSchema,
  GallerySchema,
  GalleryItemSchema,
  VideosSchema,
  AboutSchema,
  SiteSchema,
  type BlogPost,
  type Project,
  type Gallery,
  type GalleryItem,
  type About,
  type Site,
} from '@portfolio/content-schema';

/**
 * API layer over the Tauri backend (generic fs + copy commands, dialog plugin,
 * asset protocol) and the shared content schema. Every content type is read,
 * validated, and written here so the React screens stay declarative. Content
 * is validated with the same Zod schema the website uses.
 */

export const BLOG_REL = 'src/content/blog';
export const PROJECTS_REL = 'src/content/projects';
export const GALLERY_REL = 'src/content/gallery/index.json';
export const ABOUT_REL = 'src/content/about/index.json';
export const SITE_REL = 'src/content/site/index.json';

export type DirEntry = { name: string; is_dir: boolean };

const pathExists = (path: string) => invoke<boolean>('path_exists', { path });
const listDir = (path: string) => invoke<DirEntry[]>('list_dir', { path });
const readTextFile = (path: string) => invoke<string>('read_text_file', { path });
const writeTextFile = (path: string, contents: string) => invoke<void>('write_text_file', { path, contents });
const copyFile = (src: string, dest: string) => invoke<void>('copy_file', { src, dest });
const removeFile = (path: string) => invoke<void>('remove_file', { path });
const removeDir = (path: string) => invoke<void>('remove_dir', { path });
export const renamePath = (from: string, to: string) => invoke<void>('rename_path', { from, to });

const join = (...parts: string[]) => parts.join('/');
const basename = (p: string) => p.split(/[\\/]/).pop() || p;
const isExternal = (s: string) => /^(?:[a-z]+:)?\/\//i.test(s) || s.startsWith('data:');

/* --------------------------------------------------------------- repo / picker */

export async function pickRepo(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: 'Select your portfolio repo' });
  return typeof result === 'string' ? result : null;
}

export type RepoValidation = {
  ok: boolean;
  checks: { label: string; exists: boolean; required: boolean }[];
};

export async function validateRepo(root: string): Promise<RepoValidation> {
  const wanted = [
    { label: 'package.json', rel: 'package.json', required: true },
    { label: 'content root', rel: 'src/content', required: true },
    { label: 'blog content', rel: 'src/content/blog', required: true },
    { label: 'shared schema', rel: 'src/content/schema.ts', required: false },
  ];
  const checks = await Promise.all(
    wanted.map(async (w) => ({ label: w.label, exists: await pathExists(join(root, w.rel)), required: w.required })),
  );
  return { ok: checks.every((c) => c.exists || !c.required), checks };
}

/* ------------------------------------------------------------------ media */

/** Resolve a content image/video `src` to a URL the webview can load. */
export function mediaUrl(root: string, src: string | null | undefined, baseDir?: string): string {
  if (!src) return '';
  const s = src.trim();
  if (!s) return '';
  if (isExternal(s)) return s;
  const abs = s.startsWith('/')
    ? `${root}/public${s}`
    : `${root}/${baseDir ? baseDir + '/' : ''}${s.replace(/^\.\//, '')}`;
  return convertFileSrc(abs);
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
const MODEL_EXTS = ['glb', 'gltf', 'step', 'stp', 'obj'];
const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();
const isVideoExt = (p: string) => VIDEO_EXTS.includes(extOf(p));

async function pickFile(name: string, extensions: string[]): Promise<string | null> {
  const r = await open({ multiple: false, filters: [{ name, extensions }] });
  return typeof r === 'string' ? r : null;
}

/** Slugified base filename without extension: "My Photo.JPG" → "my-photo". */
function cleanBase(p: string): string {
  return (basename(p).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'file';
}

export type Tools = { ffmpeg: boolean; node: boolean };
export const checkTools = () => invoke<Tools>('check_tools');
const processImageCmd = (src: string, dest: string) => invoke<void>('process_image', { src, dest });
const processVideoCmd = (src: string, dest: string) => invoke<void>('process_video', { src, dest });
const convertModelCmd = (repo: string, src: string, dest: string) => invoke<void>('convert_model', { repo, src, dest });

let toolsCache: Tools | null = null;
const tools = async (): Promise<Tools> => (toolsCache ??= await checkTools());

/** Where an import lands: a repo-relative folder and the prefix content uses to
 *  reference files in it ("/" for public/, "assets/" for a blog post's folder). */
export type ImportDest = { dir: string; ref: string };
const PUBLIC_DEST: ImportDest = { dir: 'public', ref: '/' };

/** Import destinations inside a blog post folder ("src/content/blog/<slug>"):
 *  images and models → assets/, videos → videos/ (the existing post layout). */
export function postImportDests(baseDir: string): { image: ImportDest; video: ImportDest; model: ImportDest } {
  const assets = { dir: `${baseDir}/assets`, ref: 'assets/' };
  return { image: assets, video: { dir: `${baseDir}/videos`, ref: 'videos/' }, model: assets };
}

/** First free "<base>.<ext>" in `dir` (then "<base>-2.<ext>", …) so an import never overwrites an existing file. */
async function uniqueName(root: string, dir: string, base: string, ext: string): Promise<string> {
  let name = ext ? `${base}.${ext}` : base;
  for (let i = 2; await pathExists(join(root, dir, name)); i++) name = ext ? `${base}-${i}.${ext}` : `${base}-${i}`;
  return name;
}

// Compress a picked image → WebP in `dest` (copy fallback if ffmpeg is absent).
async function processImageFile(root: string, src: string, dest: ImportDest = PUBLIC_DEST): Promise<string> {
  const base = cleanBase(src);
  if ((await tools()).ffmpeg && extOf(src) !== 'svg') {
    const name = await uniqueName(root, dest.dir, base, 'webp');
    await processImageCmd(src, join(root, dest.dir, name));
    return dest.ref + name;
  }
  const name = await uniqueName(root, dest.dir, base, extOf(src));
  await copyFile(src, join(root, dest.dir, name));
  return dest.ref + name;
}

// Compress a picked video → MP4 in `dest` (copy fallback if ffmpeg is absent).
async function processVideoFile(root: string, src: string, dest: ImportDest = PUBLIC_DEST): Promise<string> {
  const base = cleanBase(src);
  if ((await tools()).ffmpeg) {
    const name = await uniqueName(root, dest.dir, base, 'mp4');
    await processVideoCmd(src, join(root, dest.dir, name));
    return dest.ref + name;
  }
  const name = await uniqueName(root, dest.dir, base, extOf(src));
  await copyFile(src, join(root, dest.dir, name));
  return dest.ref + name;
}

/** Pick + compress an image into public/ (or `dest`). */
export async function importPublicImage(root: string, dest?: ImportDest): Promise<string | null> {
  const src = await pickFile('Images', IMAGE_EXTS);
  return src ? processImageFile(root, src, dest) : null;
}

/** Pick + compress a video into public/ (or `dest`). */
export async function importPublicVideo(root: string, dest?: ImportDest): Promise<string | null> {
  const src = await pickFile('Videos', VIDEO_EXTS);
  return src ? processVideoFile(root, src, dest) : null;
}

/** Pick an image OR video and compress it appropriately (into `dests.image` / `dests.video`, default public/). */
export async function importPublicMedia(
  root: string,
  dests?: { image?: ImportDest; video?: ImportDest },
): Promise<string | null> {
  const src = await pickFile('Media', [...IMAGE_EXTS, ...VIDEO_EXTS]);
  if (!src) return null;
  return isVideoExt(src) ? processVideoFile(root, src, dests?.video) : processImageFile(root, src, dests?.image);
}

/** Pick a 3D model (STEP/OBJ/GLB) and convert + optimize it to GLB in public/ (or `dest`). */
export async function importPublicModel(root: string, dest: ImportDest = PUBLIC_DEST): Promise<string | null> {
  const src = await pickFile('3D models', MODEL_EXTS);
  if (!src) return null;
  const base = cleanBase(src);
  const ext = extOf(src);
  if ((await tools()).node) {
    const name = await uniqueName(root, dest.dir, base, 'glb');
    await convertModelCmd(root, src, join(root, dest.dir, name));
    return dest.ref + name;
  }
  if (ext === 'glb' || ext === 'gltf') {
    const name = await uniqueName(root, dest.dir, base, ext);
    await copyFile(src, join(root, dest.dir, name));
    return dest.ref + name;
  }
  throw new Error('Converting STEP/OBJ needs Node.js. Import a .glb instead, or run the CMS where Node is available.');
}

/** Import any file into public/ unchanged (e.g. a PDF resume). */
export async function importPublicFile(root: string, extensions: string[]): Promise<string | null> {
  const src = await pickFile('File', extensions);
  if (!src) return null;
  const name = await uniqueName(root, 'public', cleanBase(src), extOf(src));
  await copyFile(src, join(root, 'public', name));
  return '/' + name;
}

/** Import ANY file (no type filter) into public/files — for odds and ends like
 *  .docx, .zip, etc. that you just want available for download. */
export async function importPublicAnyFile(root: string): Promise<string | null> {
  const r = await open({ multiple: false, title: 'Select any file' });
  const src = typeof r === 'string' ? r : null;
  if (!src) return null;
  const bn = basename(src);
  const dot = bn.lastIndexOf('.');
  const ext = dot > 0 ? bn.slice(dot + 1).toLowerCase() : '';
  const name = await uniqueName(root, 'public/files', cleanBase(src), ext);
  await copyFile(src, join(root, 'public', 'files', name));
  return '/files/' + name;
}

/* ----------------------------------------------------------- media library */

export type MediaKind = 'image' | 'video' | 'model' | 'other';
/** Where a file lives: served by the site (public/), a blog post's own folder
 *  (src/content/blog/<slug>/, referenced relatively), or raw source (models/). */
export type MediaArea = 'public' | 'models' | 'blog';

export type MediaAsset = {
  area: MediaArea;
  /** Path under its area root, e.g. "images/foo.webp" or "board.step". For blog
   *  assets the root is src/content/blog, so this is "<slug>/assets/foo.webp". */
  rel: string;
  /** Absolute path on disk (for delete / convert). */
  abs: string;
  /** Reference used in content: "/foo.webp" for public files, the post-relative
   *  path ("assets/foo.webp") for blog files; '' for source files. */
  ref: string;
  /** (blog only) slug of the post that owns the file. */
  post?: string;
  name: string;
  dir: string;
  kind: MediaKind;
  ext: string;
  bytes: number;
  /** Asset-protocol URL for previewing in the webview. */
  url: string;
  /** Can be shown directly in the 3D viewer (glb/gltf/obj — not step). */
  viewable3d: boolean;
  /** (public / blog) referenced somewhere — false = orphan. For blog files this
   *  means referenced from its own post's index.json. */
  used: boolean;
  /** (public only) content areas that reference it — folder names under
   *  src/content (e.g. "projects", "blog"). Empty when it's used only in code,
   *  or not at all. Powers the library's "where is this used" category filter. */
  usedIn: string[];
  /** Infrastructure/config file that should never be offered for deletion. */
  system: boolean;
};

/** Content folders under src/content that can reference an asset, in the order
 *  the library/picker shows their filter chips. Keys are the folder names. */
export const USAGE_AREAS: { key: string; label: string }[] = [
  { key: 'blog', label: 'Blog' },
  { key: 'projects', label: 'Projects' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'about', label: 'About' },
  { key: 'site', label: 'Site & Home' },
];

const USAGE_LABEL = new Map(USAGE_AREAS.map((u) => [u.key, u.label]));

/** Human label for a usage filter key (content area, or 'other'/'unused'). */
export function usageLabel(key: string): string {
  if (key === 'unused') return 'Unused';
  if (key === 'other') return 'Other';
  return USAGE_LABEL.get(key) ?? key;
}

/** The filter buckets an asset belongs to: its content areas, or 'other' (used
 *  only in code/config) or 'unused' (referenced nowhere — a deletable orphan). */
export function assetUsageKeys(a: MediaAsset): string[] {
  if (a.usedIn.length > 0) return a.usedIn;
  return a.used || a.system ? ['other'] : ['unused'];
}

/** Whether an asset passes a usage filter ('all' matches everything). */
export function matchesUsage(a: MediaAsset, key: string): boolean {
  return key === 'all' || assetUsageKeys(a).includes(key);
}

const MODEL_VIEW_EXTS = ['glb', 'gltf', 'obj'];

const kindOf = (name: string): MediaKind => {
  const e = extOf(name);
  if (IMAGE_EXTS.includes(e)) return 'image';
  if (VIDEO_EXTS.includes(e)) return 'video';
  if (MODEL_EXTS.includes(e)) return 'model';
  return 'other';
};

// Host/infra files that live in public/ but aren't deletable content.
const isSystemFile = (name: string) =>
  name.startsWith('_') || name === 'robots.txt' || name === 'sitemap.xml' || extOf(name) === 'ico';

export type ScanEntry = { rel: string; bytes: number };

/** Recursively list every file under an absolute directory with its size. */
export const scanDir = (path: string) => invoke<ScanEntry[]>('scan_dir', { path });
/** Of the given reference strings, those that appear in any repo text file. */
export const grepRefs = (root: string, needles: string[]) => invoke<string[]>('grep_refs', { root, needles });

function toAsset(root: string, area: MediaArea, f: ScanEntry): MediaAsset {
  const slash = f.rel.lastIndexOf('/');
  const name = slash >= 0 ? f.rel.slice(slash + 1) : f.rel;
  const ext = extOf(name);
  const abs = area === 'blog' ? `${root}/${BLOG_REL}/${f.rel}` : `${root}/${area}/${f.rel}`;
  const post = area === 'blog' ? f.rel.slice(0, f.rel.indexOf('/')) : undefined;
  return {
    area,
    rel: f.rel,
    abs,
    ref: area === 'public' ? '/' + f.rel : area === 'blog' ? f.rel.slice(f.rel.indexOf('/') + 1) : '',
    post,
    name,
    dir: slash >= 0 ? f.rel.slice(0, slash) : '',
    kind: kindOf(name),
    ext,
    bytes: f.bytes,
    url: convertFileSrc(abs),
    viewable3d: MODEL_VIEW_EXTS.includes(ext),
    used: false,
    usedIn: [],
    system: area === 'public' && isSystemFile(name),
  };
}

/** Boundary-aware needles for a public ref ("/a.jpg"): the ref must directly
 *  follow a quote, backtick or "(" so "/a.jpg" never matches "assets/a.jpg". */
const REF_LEADS = ['"', "'", '`', '('];
const publicNeedles = (ref: string) => REF_LEADS.map((c) => c + ref);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether post JSON text references a post-relative path ("assets/a.jpg",
 *  "./assets/a.jpg"), without matching a longer path that merely ends in it. */
function refInText(text: string, ref: string): boolean {
  return new RegExp(`(^|[^\\w./-])(\\./)?${escapeRe(ref)}(?![\\w-])`).test(text);
}

/**
 * Files colocated with blog posts (src/content/blog/<slug>/assets|videos/…).
 * Each is "used" when its own post's index.json references it by relative path.
 */
async function listBlogAssets(root: string): Promise<MediaAsset[]> {
  let files: ScanEntry[];
  try {
    files = await scanDir(join(root, BLOG_REL));
  } catch {
    return [];
  }
  const assets = files
    .filter((f) => {
      const parts = f.rel.split('/');
      return parts.length >= 2 && !parts[parts.length - 1].startsWith('.') && f.rel.slice(f.rel.indexOf('/') + 1) !== 'index.json';
    })
    .map((f) => toAsset(root, 'blog', f));
  const texts = new Map<string, string>();
  await Promise.all(
    [...new Set(assets.map((a) => a.post as string))].map(async (slug) => {
      try {
        texts.set(slug, await readTextFile(join(root, BLOG_REL, slug, 'index.json')));
      } catch { /* no index.json — every file in the folder reads as unused */ }
    }),
  );
  for (const a of assets) {
    a.used = refInText(texts.get(a.post as string) ?? '', a.ref);
    a.usedIn = a.used ? ['blog'] : [];
  }
  return assets;
}

const CONTENT_REL = 'src/content';

/**
 * For each ref, which content areas (top-level folder under src/content)
 * reference it. Content-only by design — unlike `grep_refs`, which scans the
 * whole repo (components, index.html, css) to decide "used at all" — this answers
 * the narrower "where in the CONTENT is this used", which drives the library's
 * category filter. Reads each content JSON once and substring-matches the refs,
 * boundary-aware matching (`publicNeedles`).
 */
async function scanContentUsage(root: string, refs: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (refs.length === 0) return out;
  let files: ScanEntry[];
  try {
    files = await scanDir(join(root, CONTENT_REL));
  } catch {
    return out; // no content dir / unreadable — treat as "unknown", not a hard error
  }
  const byArea: Record<string, string[]> = {};
  await Promise.all(
    files
      .filter((f) => f.rel.endsWith('.json'))
      .map(async (f) => {
        const area = f.rel.split('/')[0];
        try {
          const text = await readTextFile(join(root, CONTENT_REL, f.rel));
          (byArea[area] ??= []).push(text);
        } catch { /* skip unreadable file */ }
      }),
  );
  for (const [area, texts] of Object.entries(byArea)) {
    const blob = texts.join('\n');
    for (const ref of refs) {
      if (publicNeedles(ref).some((n) => blob.includes(n))) (out[ref] ??= []).push(area);
    }
  }
  return out;
}

/**
 * Every file the project carries, in three areas:
 *  - public/ — served by the website (orphan detection applies here)
 *  - src/content/blog/<slug>/ — per-post assets/videos (area 'blog'; orphan
 *    detection against the post's own index.json)
 *  - models/ — raw 3D source (STEP/OBJ); viewable in the CMS, not deployed
 */
export async function listMedia(root: string): Promise<MediaAsset[]> {
  const [pub, src, blog] = await Promise.all([scanDir(`${root}/public`), scanDir(`${root}/models`), listBlogAssets(root)]);
  const publicAssets = pub.map((f) => toAsset(root, 'public', f));
  const sourceAssets = src.map((f) => toAsset(root, 'models', f));
  // "Used" only means something for served files; flag orphans in public/.
  const refs = publicAssets.map((a) => a.ref);
  const [found, usage] = await Promise.all([
    grepRefs(root, refs.flatMap(publicNeedles)).then((r) => new Set(r)),
    scanContentUsage(root, refs),
  ]);
  for (const a of publicAssets) {
    a.used = publicNeedles(a.ref).some((n) => found.has(n));
    a.usedIn = usage[a.ref] ?? [];
  }
  return [...publicAssets, ...blog, ...sourceAssets];
}

/** Delete any asset by its absolute path. */
export async function deleteMedia(_root: string, abs: string): Promise<void> {
  await removeFile(abs);
}

/** Convert a source model (OBJ/STEP/GLB) to an optimized GLB in public/. */
export async function convertSourceToWebGlb(root: string, abs: string): Promise<string> {
  const name = cleanBase(abs) + '.glb';
  await convertModelCmd(root, abs, join(root, 'public', name));
  return '/' + name;
}

export const cropImageCmd = (src: string, dest: string, x: number, y: number, w: number, h: number) =>
  invoke<void>('crop_image', { src, dest, x, y, w, h });

/**
 * Crop a rectangle (in source pixels) out of an image into a new WebP next to
 * the source, returning the new reference in the same form as `srcRef`: public
 * images ("/foo.webp") crop into public/; post-relative refs ("assets/foo.jpg",
 * resolved against `baseDir`) crop into the same folder under `baseDir`. The
 * original file is left untouched, so the crop is a separate, re-pickable asset.
 */
export async function cropImage(
  root: string,
  srcRef: string,
  rect: { x: number; y: number; w: number; h: number },
  baseDir?: string,
): Promise<string> {
  if (!(await tools()).ffmpeg) {
    throw new Error('Cropping needs ffmpeg. Install it (or run the CMS where it is available), then try again.');
  }
  const isPublic = srcRef.startsWith('/');
  if (!isPublic && !baseDir) throw new Error('Cannot crop a relative image without its folder.');
  const rel = srcRef.replace(/^\.?\//, '');
  const slash = rel.lastIndexOf('/');
  const refDir = isPublic ? '' : slash >= 0 ? rel.slice(0, slash + 1) : '';
  const absDir = isPublic ? join(root, 'public') : [root, baseDir as string, refDir.replace(/\/$/, '')].filter(Boolean).join('/');
  const src = isPublic ? `${root}/public${srcRef}` : join(root, baseDir as string, rel);
  // Strip any existing "-crop" suffix so re-cropping doesn't stack (foo-crop-crop).
  const base = cleanBase(srcRef).replace(/-crop(-\d+)?$/, '');
  let name = `${base}-crop.webp`;
  for (let i = 2; await pathExists(join(absDir, name)); i++) {
    name = `${base}-crop-${i}.webp`;
  }
  await cropImageCmd(
    src,
    join(absDir, name),
    Math.max(0, Math.round(rect.x)),
    Math.max(0, Math.round(rect.y)),
    Math.max(1, Math.round(rect.w)),
    Math.max(1, Math.round(rect.h)),
  );
  return isPublic ? '/' + name : refDir + name;
}

/* ------------------------------------------------------- generic collections */

export type CollectionOptions = {
  /** Field holding a record's unique id (and its filename, for folder collections). Default `id`. */
  idKey?: string;
  /** Numeric field that controls display order. Default `displayOrder`. */
  orderKey?: string;
  /** Gap between consecutive order values written by `reorder`. Default 1. */
  orderStep?: number;
};

export type Collection<T extends object> = {
  REL: string;
  label: string;
  idKey: string;
  orderKey: string;
  /** Valid records only (invalid files are logged and skipped). Sorted by `orderKey` when records carry one. */
  list: (root: string) => Promise<T[]>;
  read: (root: string, id: string) => Promise<T>;
  /** Validate + write (upsert by id). */
  save: (root: string, item: unknown) => Promise<T>;
  /** Validate + write; throws if the id already exists. */
  create: (root: string, seed: unknown) => Promise<T>;
  remove: (root: string, id: string) => Promise<void>;
  /** Persist a new order: record `ids[i]` gets `orderKey = (i + 1) * orderStep`. */
  reorder: (root: string, ids: string[]) => Promise<void>;
};

const fieldOf = (item: unknown, key: string): unknown => (item as Record<string, unknown>)[key];

function sortByOrder<T extends object>(items: T[], orderKey: string): T[] {
  if (!items.some((i) => typeof fieldOf(i, orderKey) === 'number')) return items;
  const n = (i: T) => {
    const v = fieldOf(i, orderKey);
    return typeof v === 'number' ? v : Number.MAX_SAFE_INTEGER;
  };
  return [...items].sort((a, b) => n(a) - n(b));
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

/** Build a CRUD wrapper for a "one JSON file per record" content folder. */
export function makeCollection<T extends object>(
  rel: string,
  schema: ZodType<T>,
  label: string,
  opts: CollectionOptions = {},
): Collection<T> {
  const idKey = opts.idKey ?? 'id';
  const orderKey = opts.orderKey ?? 'displayOrder';
  const orderStep = opts.orderStep ?? 1;
  const dirOf = (root: string) => join(root, rel);
  const fileOf = (root: string, id: string) => join(root, rel, `${safeId(id)}.json`);
  const idOf = (item: T) => String(fieldOf(item, idKey));
  const safeId = (id: string): string => {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      throw new Error(`Invalid ${label} ${idKey} "${id}": use only letters, numbers, "-" and "_" (no slashes or dots).`);
    }
    return id;
  };
  const api: Collection<T> = {
    REL: rel,
    label,
    idKey,
    orderKey,
    async list(root) {
      const entries = await listDir(dirOf(root)).catch(() => [] as DirEntry[]);
      const items: T[] = [];
      for (const entry of entries) {
        if (entry.is_dir || !entry.name.endsWith('.json')) continue;
        try {
          const parsed = schema.safeParse(JSON.parse(await readTextFile(join(dirOf(root), entry.name))));
          if (parsed.success) items.push(parsed.data);
          else console.error(`Invalid ${label} ${entry.name}:`, parsed.error.message);
        } catch (err) {
          console.error(`Could not read ${label} ${entry.name}:`, err);
        }
      }
      return sortByOrder(items, orderKey);
    },
    async read(root, id) {
      return schema.parse(JSON.parse(await readTextFile(fileOf(root, id))));
    },
    async save(root, item) {
      const validated = schema.parse(item);
      await writeTextFile(fileOf(root, idOf(validated)), JSON.stringify(validated, null, 2) + '\n');
      return validated;
    },
    async create(root, seed) {
      const validated = schema.parse(seed);
      const file = fileOf(root, idOf(validated));
      if (await pathExists(file)) throw new Error(`A ${label} with ${idKey} "${idOf(validated)}" already exists.`);
      await writeTextFile(file, JSON.stringify(validated, null, 2) + '\n');
      return validated;
    },
    async remove(root, id) {
      await removeFile(fileOf(root, id));
    },
    async reorder(root, ids) {
      const recs: T[] = [];
      for (const id of ids) recs.push(await api.read(root, id)); // validate every id + file before writing any
      // Reuse the existing order numbers (sorted) when they're all distinct, so a swap
      // only rewrites the records that moved; otherwise renumber in `orderStep`s.
      const current = recs.map((r) => fieldOf(r, orderKey));
      const reuse = current.every((v) => typeof v === 'number') && new Set(current).size === current.length;
      const slots = reuse ? (current as number[]).slice().sort((a, b) => a - b) : null;
      for (let i = 0; i < recs.length; i++) {
        const order = slots ? slots[i] : (i + 1) * orderStep;
        if (fieldOf(recs[i], orderKey) !== order) await api.save(root, { ...recs[i], [orderKey]: order });
      }
    },
  };
  return api;
}

/**
 * Same `Collection` interface over a single JSON file that wraps an array
 * (e.g. gallery/index.json = `{ items: [...] }`), so a generic list editor can
 * drive it without changing the file format. Order is the array order; `reorder`
 * rewrites the array, so `orderKey` is unused (reported as '').
 */
export function makeArrayCollection<W extends object, T extends object>(
  fileRel: string,
  wrapperSchema: ZodType<W>,
  arrayKey: string,
  itemSchema: ZodType<T>,
  idKey: string,
  label = 'item',
): Collection<T> {
  const fileOf = (root: string) => join(root, fileRel);
  const idOf = (item: T) => String(fieldOf(item, idKey));
  // `raw` is the file's parsed JSON, kept so keys the schema doesn't know survive a write.
  const load = async (root: string): Promise<{ wrapper: W; raw: Record<string, unknown> }> => {
    const file = fileOf(root);
    if (!(await pathExists(file))) return { wrapper: wrapperSchema.parse({}), raw: {} };
    const raw = JSON.parse(await readTextFile(file)) as Record<string, unknown>;
    return { wrapper: wrapperSchema.parse(raw), raw };
  };
  const itemsOf = (wrapper: W) => (fieldOf(wrapper, arrayKey) as T[]) ?? [];
  const persist = async (root: string, raw: Record<string, unknown>, items: T[]): Promise<void> => {
    const next = { ...raw, [arrayKey]: items };
    wrapperSchema.parse(next);
    await writeTextFile(fileOf(root), JSON.stringify(next, null, 2) + '\n');
  };
  return {
    REL: fileRel,
    label,
    idKey,
    orderKey: '',
    async list(root) {
      return itemsOf((await load(root)).wrapper);
    },
    async read(root, id) {
      const found = itemsOf((await load(root)).wrapper).find((i) => idOf(i) === id);
      if (!found) throw new Error(`No ${label} with ${idKey} "${id}".`);
      return found;
    },
    async save(root, item) {
      const validated = itemSchema.parse(item);
      const { wrapper, raw } = await load(root);
      const items = [...itemsOf(wrapper)];
      const at = items.findIndex((i) => idOf(i) === idOf(validated));
      if (at >= 0) items[at] = validated;
      else items.push(validated);
      await persist(root, raw, items);
      return validated;
    },
    async create(root, seed) {
      const validated = itemSchema.parse(seed);
      const { wrapper, raw } = await load(root);
      const items = itemsOf(wrapper);
      if (items.some((i) => idOf(i) === idOf(validated))) {
        throw new Error(`A ${label} with ${idKey} "${idOf(validated)}" already exists.`);
      }
      await persist(root, raw, [...items, validated]);
      return validated;
    },
    async remove(root, id) {
      const { wrapper, raw } = await load(root);
      await persist(root, raw, itemsOf(wrapper).filter((i) => idOf(i) !== id));
    },
    async reorder(root, ids) {
      const { wrapper, raw } = await load(root);
      const items = itemsOf(wrapper);
      const rank = new Map(ids.map((id, i) => [id, i]));
      const sorted = [...items].sort(
        (a, b) => (rank.get(idOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(idOf(b)) ?? Number.MAX_SAFE_INTEGER),
      );
      await persist(root, raw, sorted);
    },
  };
}

export const projectsApi = makeCollection<Project>(PROJECTS_REL, ProjectSchema, 'project', {
  idKey: 'id',
  orderKey: 'order',
  orderStep: 10,
});
export const galleryItemsApi = makeArrayCollection<Gallery, GalleryItem>(
  GALLERY_REL,
  GallerySchema,
  'items',
  GalleryItemSchema,
  'id',
  'gallery item',
);

/* ------------------------------------------------------------------- blog */

export type PostSummary = {
  slug: string;
  title: string;
  status: string;
  date?: string;
  displayDate?: string;
  tags: string[];
  blockCount: number;
  valid: boolean;
  error?: string;
};

export async function listPosts(root: string): Promise<PostSummary[]> {
  const dir = join(root, BLOG_REL);
  const entries = await listDir(dir).catch(() => [] as DirEntry[]);
  const posts: PostSummary[] = [];
  for (const entry of entries) {
    if (!entry.is_dir) continue;
    const file = join(dir, entry.name, 'index.json');
    if (!(await pathExists(file))) continue;
    try {
      const raw = JSON.parse(await readTextFile(file)) as Record<string, unknown>;
      const parsed = BlogPostSchema.safeParse(raw);
      if (parsed.success) {
        const p = parsed.data;
        posts.push({ slug: entry.name, title: p.title, status: p.status, date: p.date, displayDate: p.displayDate, tags: p.tags, blockCount: p.blocks.length, valid: true });
      } else {
        posts.push({ slug: entry.name, title: typeof raw.title === 'string' ? raw.title : entry.name, status: typeof raw.status === 'string' ? raw.status : 'unknown', tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [], blockCount: Array.isArray(raw.blocks) ? raw.blocks.length : 0, valid: false, error: parsed.error.message });
      }
    } catch (err) {
      posts.push({ slug: entry.name, title: entry.name, status: 'unknown', tags: [], blockCount: 0, valid: false, error: String(err) });
    }
  }
  posts.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return posts;
}

export async function readPost(root: string, slug: string): Promise<BlogPost> {
  return BlogPostSchema.parse(JSON.parse(await readTextFile(join(root, BLOG_REL, slug, 'index.json'))));
}

export async function savePost(root: string, slug: string, data: unknown): Promise<BlogPost> {
  const validated = BlogPostSchema.parse(data);
  await writeTextFile(join(root, BLOG_REL, slug, 'index.json'), JSON.stringify(validated, null, 2) + '\n');
  return validated;
}

export async function createPost(root: string, slug: string, title: string): Promise<BlogPost> {
  const file = join(root, BLOG_REL, slug, 'index.json');
  if (await pathExists(file)) throw new Error(`A post with slug "${slug}" already exists.`);
  const draft = BlogPostSchema.parse({ type: 'blog', id: slug, title, status: 'draft', blocks: [] });
  await writeTextFile(file, JSON.stringify(draft, null, 2) + '\n');
  return draft;
}

export async function deletePost(root: string, slug: string): Promise<void> {
  await removeDir(join(root, BLOG_REL, slug));
}

/* --------------------------------------------------------------- projects */

export async function listProjects(root: string): Promise<Project[]> {
  const dir = join(root, PROJECTS_REL);
  const entries = await listDir(dir).catch(() => [] as DirEntry[]);
  const projects: Project[] = [];
  for (const entry of entries) {
    if (entry.is_dir || !entry.name.endsWith('.json')) continue;
    try {
      const parsed = ProjectSchema.safeParse(JSON.parse(await readTextFile(join(dir, entry.name))));
      if (parsed.success) projects.push(parsed.data);
      else console.error(`Invalid project ${entry.name}:`, parsed.error.message);
    } catch (err) {
      console.error(`Could not read project ${entry.name}:`, err);
    }
  }
  projects.sort((a, b) => a.order - b.order);
  return projects;
}

export async function saveProject(root: string, project: unknown): Promise<Project> {
  const validated = ProjectSchema.parse(project);
  await writeTextFile(join(root, PROJECTS_REL, `${validated.id}.json`), JSON.stringify(validated, null, 2) + '\n');
  return validated;
}

export async function createProject(root: string, slug: string, title: string, order: number): Promise<Project> {
  const file = join(root, PROJECTS_REL, `${slug}.json`);
  if (await pathExists(file)) throw new Error(`A project with slug "${slug}" already exists.`);
  const project = ProjectSchema.parse({ type: 'project', id: slug, title, status: 'Completed', order, image: '', description: '', tags: [] });
  await writeTextFile(file, JSON.stringify(project, null, 2) + '\n');
  return project;
}

export async function deleteProject(root: string, slug: string): Promise<void> {
  await removeFile(join(root, PROJECTS_REL, `${slug}.json`));
}

/* ---------------------------------------------------------------- gallery */

export async function readGallery(root: string): Promise<Gallery> {
  const file = join(root, GALLERY_REL);
  if (!(await pathExists(file))) return GallerySchema.parse({});
  return GallerySchema.parse(JSON.parse(await readTextFile(file)));
}

export async function saveGallery(root: string, data: unknown): Promise<Gallery> {
  const validated = GallerySchema.parse(data);
  await writeTextFile(join(root, GALLERY_REL), JSON.stringify(validated, null, 2) + '\n');
  return validated;
}

/* ------------------------------------------------------------------ about */

export async function readAbout(root: string): Promise<About> {
  const file = join(root, ABOUT_REL);
  if (!(await pathExists(file))) return AboutSchema.parse({});
  return AboutSchema.parse(JSON.parse(await readTextFile(file)));
}

export async function saveAbout(root: string, data: unknown): Promise<About> {
  const validated = AboutSchema.parse(data);
  await writeTextFile(join(root, ABOUT_REL), JSON.stringify(validated, null, 2) + '\n');
  return validated;
}

/* ------------------------------------------------------------------- site */

export async function readSite(root: string): Promise<Site> {
  const file = join(root, SITE_REL);
  if (!(await pathExists(file))) return SiteSchema.parse({});
  return SiteSchema.parse(JSON.parse(await readTextFile(file)));
}

export async function saveSite(root: string, data: unknown): Promise<Site> {
  const validated = SiteSchema.parse(data);
  await writeTextFile(join(root, SITE_REL), JSON.stringify(validated, null, 2) + '\n');
  return validated;
}

/* ----------------------------------------------------------- preview server */

export const PREVIEW_PORT = 4321;

/** True if something is listening on the preview port. */
export const previewStatus = (port = PREVIEW_PORT) => invoke<boolean>('preview_status', { port });
/** Spawn the site's Vite dev server (no-op if already running). */
export const startPreview = (root: string, port = PREVIEW_PORT) => invoke<void>('start_preview', { root, port });
/** Stop the server; resolves true only if the port is actually free afterwards. */
export const stopPreview = (port = PREVIEW_PORT) => invoke<boolean>('stop_preview', { port });
/** Forcefully free the port (fallback when a polite stop fails). */
export const killPort = (port = PREVIEW_PORT) => invoke<void>('kill_port', { port });

/* -------------------------------------------------------------------- git */

export type GitStatus = { branch: string; changes: string[]; clean: boolean };

export const gitStatus = (root: string) => invoke<GitStatus>('git_status', { root });
export const gitCommit = (root: string, message: string) => invoke<string>('git_commit', { root, message });
export const gitPush = (root: string) => invoke<string>('git_push', { root });

/* --- safe sync (fetch → merge → push) so a stale editor never overwrites work */

export type GitSyncStatus = {
  branch: string;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  clean: boolean;
  conflicted: string[];
  merging: boolean;
};
export type MergeResult = { ok: boolean; conflicted: string[]; output: string };
export type ConflictVersions = {
  file: string;
  base: string;
  ours: string;
  theirs: string;
  oursExists: boolean;
  theirsExists: boolean;
  binary: boolean;
};
export type GitCommitInfo = { hash: string; author: string; when: string; subject: string };

export const gitFetch = (root: string) => invoke<string>('git_fetch', { root });
export const gitSyncStatus = (root: string) => invoke<GitSyncStatus>('git_sync_status', { root });
export const gitMergeRemote = (root: string) => invoke<MergeResult>('git_merge_remote', { root });
export const gitConflictVersions = (root: string, file: string) =>
  invoke<ConflictVersions>('git_conflict_versions', { root, file });
export const gitResolveFile = (root: string, file: string, contents: string) =>
  invoke<void>('git_resolve_file', { root, file, contents });
export const gitResolveSide = (root: string, file: string, side: 'ours' | 'theirs') =>
  invoke<void>('git_resolve_side', { root, file, side });
export const gitMergeContinue = (root: string) =>
  invoke<{ ok: boolean; conflicted?: string[]; output?: string }>('git_merge_continue', { root });
export const gitMergeAbort = (root: string) => invoke<string>('git_merge_abort', { root });
export const gitLog = (root: string, count = 20) => invoke<GitCommitInfo[]>('git_log', { root, count });
export const gitRevert = (root: string, hash: string) =>
  invoke<{ ok: boolean; output: string }>('git_revert', { root, hash });

/* --- local Ollama (proxied through Rust to avoid CORS) for the conflict helper */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export const ollamaChat = (base: string, model: string, messages: ChatMessage[]) =>
  invoke<string>('ollama_chat', { base, model, messages });
export const ollamaModels = (base: string) => invoke<string[]>('ollama_models', { base });

/**
 * Which content schema (if any) governs a repo-relative file path. Used to
 * validate a conflict resolution before it's written, so an AI- or hand-merged
 * file can never land invalid content that breaks the site build.
 */
export function schemaForPath(path: string): ZodType | null {
  const p = path.replace(/\\/g, '/');
  if (/(^|\/)src\/content\/blog\/[^/]+\/index\.json$/.test(p)) return BlogPostSchema;
  if (/(^|\/)src\/content\/projects\/[^/]+\.json$/.test(p)) return ProjectSchema;
  if (/(^|\/)src\/content\/gallery\/index\.json$/.test(p)) return GallerySchema;
  if (/(^|\/)src\/content\/videos\/index\.json$/.test(p)) return VideosSchema;
  if (/(^|\/)src\/content\/about\/index\.json$/.test(p)) return AboutSchema;
  if (/(^|\/)src\/content\/site\/index\.json$/.test(p)) return SiteSchema;
  return null;
}

/** Validate a proposed conflict resolution: no leftover markers, valid JSON, and
 *  (when we recognize the file) passes the same schema the website enforces. */
export function validateResolvedContent(
  path: string,
  text: string,
): { ok: true } | { ok: false; error: string } {
  if (/^(<{7}|={7}|>{7}|\|{7})/m.test(text)) {
    return {
      ok: false,
      error: 'Still contains conflict markers (<<<<<<<, =======, >>>>>>>). Only the final merged version should remain.',
    };
  }
  if (!path.toLowerCase().endsWith('.json')) return { ok: true };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Not valid JSON — ' + (e instanceof Error ? e.message : String(e)) };
  }
  const schema = schemaForPath(path);
  if (!schema) return { ok: true };
  const r = schema.safeParse(data);
  if (r.success) return { ok: true };
  const detail = r.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: 'Does not match the content format — ' + detail };
}

export type { BlogPost, Project, Gallery, GalleryItem, About, Site };
