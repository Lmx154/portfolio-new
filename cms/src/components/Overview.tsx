import { useEffect, useState, type CSSProperties } from 'react';
import {
  checkTools, galleryItemsApi, gitStatus, gitSyncStatus, listMedia, listPosts, projectsApi,
  readAbout, readPost, readSite,
  type About, type BlogPost, type GalleryItem, type GitStatus, type GitSyncStatus,
  type MediaAsset, type MediaKind, type PostSummary, type Project, type Site, type Tools,
} from '../api';
import { SECTION_COLOR, SECTION_LABEL, type Section } from '../nav';
import { Icon, type IconName } from './icons';

type Navigate = (section: Section, slug?: string) => void;

type Warning = { msg: string; section: Section; slug?: string };

type Data = {
  posts: PostSummary[] | null;
  fullPosts: { slug: string; post: BlogPost }[];
  projects: Project[] | null;
  gallery: GalleryItem[] | null;
  about: About | null;
  site: Site | null;
  media: MediaAsset[] | null;
  tools: Tools | null;
  git: GitStatus | null;
  sync: GitSyncStatus | null;
};

const QUICK_ACTIONS: { label: string; section: Section; icon: IconName; blogNew?: boolean }[] = [
  { label: 'New blog post', section: 'blog', icon: 'blog' },
  { label: 'Edit projects', section: 'projects', icon: 'projects' },
  { label: 'Community', section: 'community', icon: 'community' },
  { label: 'Media', section: 'media', icon: 'media' },
  { label: 'Preview', section: 'preview', icon: 'preview' },
  { label: 'Publish', section: 'publish', icon: 'publish' },
];

// Same "large" thresholds the Media tab uses.
const HEAVY: Record<MediaKind, number> = {
  image: 700 * 1024,
  video: 12 * 1024 * 1024,
  model: 8 * 1024 * 1024,
  other: Infinity,
};

const STALE_DRAFT_DAYS = 30;
const DAY_MS = 86_400_000;

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function nameList(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

/** Compute "needs attention" warnings from whatever loaded, each linked to the tab that fixes it. */
function computeWarnings(d: Data): Warning[] {
  const w: Warning[] = [];

  for (const p of d.posts ?? []) {
    if (!p.valid) {
      w.push({ msg: `Post “${p.title}” has invalid content and won't build: ${p.error?.split('\n')[0] ?? 'unknown error'}`, section: 'blog', slug: p.slug });
    }
  }

  for (const { slug, post } of d.fullPosts) {
    if (post.status === 'published') {
      if (!post.coverImage) w.push({ msg: `Post “${post.title}” has no cover image.`, section: 'blog', slug });
      if (!post.excerpt.trim()) w.push({ msg: `Post “${post.title}” has no excerpt (description).`, section: 'blog', slug });
      if (!post.date) w.push({ msg: `Post “${post.title}” has no date.`, section: 'blog', slug });
    } else if (post.date) {
      const age = Math.floor((Date.now() - new Date(post.date).getTime()) / DAY_MS);
      if (age > STALE_DRAFT_DAYS) {
        w.push({ msg: `Draft “${post.title}” has been sitting for ${age} days — finish or delete it.`, section: 'blog', slug });
      }
    }
    const noAlt = post.blocks.filter((b) => b.type === 'image' && b.src && !b.alt?.trim()).length;
    if (noAlt) w.push({ msg: `Post “${post.title}” has ${plural(noAlt, 'image')} without alt text.`, section: 'blog', slug });
  }

  for (const pr of d.projects ?? []) {
    if (!pr.description.trim()) w.push({ msg: `Project “${pr.title}” has no description.`, section: 'projects' });
    if (!pr.image && !pr.model3d && !pr.media.some((m) => m.src)) {
      w.push({ msg: `Project “${pr.title}” has no image, 3D model, or media.`, section: 'projects' });
    }
    const noAlt = pr.media.filter((m) => m.type === 'image' && m.src && !m.alt?.trim()).length;
    if (noAlt) w.push({ msg: `Project “${pr.title}” has ${plural(noAlt, 'gallery image')} without alt text.`, section: 'projects' });
  }

  const noSrc = (d.gallery ?? []).filter((g) => !g.src);
  if (noSrc.length) {
    w.push({ msg: `${plural(noSrc.length, 'community tile')} without an image${noSrc.some((g) => g.title) ? `: ${nameList(noSrc.map((g) => g.title || String(g.id)))}` : ''}.`, section: 'community' });
  }
  const noAltTiles = (d.gallery ?? []).filter((g) => g.src && !g.alt.trim());
  if (noAltTiles.length) {
    w.push({ msg: `${plural(noAltTiles.length, 'community tile')} without alt text: ${nameList(noAltTiles.map((g) => g.title || String(g.id)))}.`, section: 'community' });
  }

  if (d.about) {
    if (!d.about.profileImage) w.push({ msg: 'About page has no profile image.', section: 'about' });
    else if (!d.about.profileAlt.trim()) w.push({ msg: 'About profile image has no alt text.', section: 'about' });
    if (!d.about.resume.href) w.push({ msg: 'About page has no resume file attached.', section: 'about' });
  }
  if (d.site) {
    if (!d.site.name.trim()) w.push({ msg: 'Home page has no name set.', section: 'home' });
    if (d.site.headlines.length === 0) w.push({ msg: 'Home page has no headline lines.', section: 'home' });
  }

  if (d.media) {
    const served = d.media.filter((a) => a.area !== 'models');
    const heavy = served.filter((a) => a.bytes > HEAVY[a.kind]);
    if (heavy.length) w.push({ msg: `${plural(heavy.length, 'large media file')} will slow the site down: ${nameList(heavy.map((a) => a.name))}.`, section: 'media' });
    const orphans = served.filter((a) => !a.used && !a.system);
    if (orphans.length) w.push({ msg: `${plural(orphans.length, 'unused media file')} (nothing references them): ${nameList(orphans.map((a) => a.name))}.`, section: 'media' });
  }

  if (d.tools) {
    if (!d.tools.ffmpeg) w.push({ msg: 'ffmpeg is not installed — imported photos and videos will not be compressed.', section: 'media' });
    if (!d.tools.node) w.push({ msg: 'Node.js is not available — 3D models cannot be converted to web GLB.', section: 'media' });
  }

  return w;
}

const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export default function Overview({ repo, onNavigate }: { repo: string; onNavigate: Navigate }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [posts, projects, gallery, about, site, media, tools, git, sync] = await Promise.all([
        soft(listPosts(repo)),
        soft(projectsApi.list(repo)),
        soft(galleryItemsApi.list(repo)),
        soft(readAbout(repo)),
        soft(readSite(repo)),
        soft(listMedia(repo)),
        soft(checkTools()),
        soft(gitStatus(repo)),
        soft(gitSyncStatus(repo)),
      ]);
      const fullPosts = (await Promise.all((posts ?? []).filter((p) => p.valid).map((p) => soft(readPost(repo, p.slug).then((post) => ({ slug: p.slug, post }))))))
        .filter((p): p is { slug: string; post: BlogPost } => !!p);
      if (alive) setData({ posts, fullPosts, projects, gallery, about, site, media, tools, git, sync });
    })();
    return () => { alive = false; };
  }, [repo]);

  const warnings = data ? computeWarnings(data) : [];
  const published = data?.posts?.filter((p) => p.status === 'published').length ?? 0;
  const drafts = data?.posts ? data.posts.length - published : 0;
  const changes = data?.git?.changes.length ?? 0;
  const behind = data?.sync?.behind ?? 0;

  return (
    <div className="app">
      <div className="topbar"><h1 style={{ fontWeight: 400 }}>Dashboard</h1></div>
      <div className="content">
        <div className="container">
          <div className="section-title">Quick actions</div>
          <div className="quick-actions">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                className="quick-action"
                style={{ '--c': SECTION_COLOR[a.section] } as CSSProperties}
                onClick={() => onNavigate(a.section)}
              >
                <span className="qa-ico"><Icon name={a.icon} size={16} /></span>
                {a.label}
              </button>
            ))}
          </div>

          <button className="help-cta" onClick={() => onNavigate('help')}>
            <span className="hc-ico"><Icon name="help" size={20} /></span>
            <span className="hc-text">
              <b>New here?</b> Open the Help guide for step-by-step instructions on every common task.
            </span>
            <span className="hc-go"><Icon name="arrow" size={16} /></span>
          </button>

          <button className="help-cta media-cta" onClick={() => onNavigate('media')}>
            <span className="hc-ico"><Icon name="media" size={20} /></span>
            <span className="hc-text">
              <b>One home for media.</b> Photos, videos, 3D models, and PDFs are imported once in <b>Media</b> — converted for the web — then you pick them from any editor.
            </span>
            <span className="hc-go"><Icon name="arrow" size={16} /></span>
          </button>

          {!data ? (
            <div className="empty">Loading…</div>
          ) : (
            <>
              <div className="section-title">Unpublished changes</div>
              {data.git || data.sync ? (
                <button
                  className={`notice clickable ${changes > 0 || behind > 0 ? 'warn' : 'ok'}`}
                  style={{ whiteSpace: 'normal' }}
                  onClick={() => onNavigate('publish')}
                  title="Open Publish"
                >
                  {changes > 0 || behind > 0 ? (
                    <span>
                      {changes > 0 && <>{plural(changes, 'file')} changed since your last publish. </>}
                      {behind > 0 && <>{plural(behind, 'update')} waiting from another computer. </>}
                      Open Publish to put {changes > 0 ? 'them' : 'it'} live.
                    </span>
                  ) : (
                    <span>Everything is published. Nothing to push. ✓</span>
                  )}
                  <span className="notice-go"><Icon name="arrow" size={15} /></span>
                </button>
              ) : (
                <div className="empty" style={{ padding: '14px 0' }}>Could not read git status.</div>
              )}

              <div className="section-title">Content</div>
              <div className="tile">
                <div className="grid2">
                  <div>
                    <label>Blog posts</label>
                    <div>{data.posts ? `${published} published · ${drafts} draft` : '—'}</div>
                  </div>
                  <div>
                    <label>Projects</label>
                    <div>{data.projects ? data.projects.length : '—'}</div>
                  </div>
                  <div>
                    <label>Community tiles</label>
                    <div>{data.gallery ? data.gallery.length : '—'}</div>
                  </div>
                  <div>
                    <label>Media files</label>
                    <div>{data.media ? data.media.filter((a) => a.area !== 'models').length : '—'}</div>
                  </div>
                </div>
              </div>

              <div className="section-title">Needs attention ({warnings.length})</div>
              {warnings.length === 0 ? (
                <div className="notice ok">Everything looks complete. ✓</div>
              ) : (
                warnings.map((wn, i) => (
                  <button
                    className="notice warn clickable"
                    key={i}
                    style={{ whiteSpace: 'normal' }}
                    onClick={() => onNavigate(wn.section, wn.slug)}
                    title={`Open ${SECTION_LABEL[wn.section]} to fix this`}
                  >
                    {wn.msg}
                    <span className="notice-go"><Icon name="arrow" size={15} /></span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
