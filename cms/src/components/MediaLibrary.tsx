import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listMedia, listPosts, deleteMedia, convertSourceToWebGlb, checkTools,
  importPublicImage, importPublicVideo, importPublicModel, importPublicFile, importPublicAnyFile,
  assetUsageKeys, matchesUsage, usageLabel, USAGE_AREAS,
  type MediaAsset, type MediaKind, type Tools,
} from '../api';
import HelpPanel from './HelpPanel';
import ModelViewerModal from './ModelViewerModal';
import { Icon, type IconName } from './icons';

/**
 * Media library — the one place to see and manage every file the project
 * carries, across three areas:
 *  - "On the website" (public/): images, videos, GLB models, other files. Shows
 *    which are still used so orphans can be cleaned out.
 *  - "Blog posts" (src/content/blog/<slug>/): each post's own assets/videos,
 *    grouped by post and checked against that post's index.json.
 *  - "Source files" (models/): raw 3D source (OBJ/STEP) that is NOT deployed but
 *    can be viewed here and converted to a small web GLB on demand.
 * Includes an in-app 3D viewer (GLB + OBJ) with per-component show/hide.
 */

// Sizes above which a served asset is flagged "large".
const HEAVY: Record<MediaKind, number> = {
  image: 700 * 1024,
  video: 12 * 1024 * 1024,
  model: 8 * 1024 * 1024,
  other: Infinity,
};

const fmtBytes = (n: number) =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

const GROUPS: { kind: MediaKind; label: string; icon: IconName }[] = [
  { kind: 'image', label: 'Images', icon: 'image' },
  { kind: 'video', label: 'Videos', icon: 'film' },
  { kind: 'model', label: '3D models', icon: 'cube' },
  { kind: 'other', label: 'Other files', icon: 'file' },
];

function Card({
  a, busy, copied, onView, onConvert, onCopy, onDelete,
}: {
  a: MediaAsset;
  busy: boolean;
  copied: string | null;
  onView: (a: MediaAsset) => void;
  onConvert: (a: MediaAsset) => void;
  onCopy: (ref: string) => void;
  onDelete: (a: MediaAsset) => void;
}) {
  const heavy = a.area !== 'models' && a.bytes > HEAVY[a.kind];
  return (
    <div className="asset-card">
      <div className="asset-thumb">
        {a.kind === 'image' && <img src={a.url} alt="" loading="lazy" />}
        {a.kind === 'video' && <video src={a.url} muted playsInline preload="metadata" />}
        {a.kind === 'model' && (
          a.viewable3d
            ? (
              <button className="asset-model-cta" onClick={() => onView(a)}>
                <Icon name="cube" size={26} /><span>View 3D</span>
              </button>
            ) : (
              <div className="asset-model-cta as-static">
                <Icon name="cube" size={26} /><span>{a.ext.toUpperCase()} source</span>
              </div>
            )
        )}
        {a.kind === 'other' && <div className="asset-otherico"><Icon name="file" size={26} /></div>}
      </div>

      <div className="asset-name" title={a.ref || a.abs}>{a.name}</div>
      <div className="asset-sub">
        <span>{fmtBytes(a.bytes)}</span>
        {a.area === 'models'
          ? (!a.viewable3d && <span className="badge sys">convert to view</span>)
          : a.system
            ? <span className="badge sys">system</span>
            : a.usedIn.length > 0
              ? a.usedIn.map((k) => <span key={k} className="badge used">{usageLabel(k)}</span>)
              : a.used
                ? <span className="badge used">in use</span>
                : <span className="badge orphan">not used</span>}
        {heavy && <span className="badge heavy">large</span>}
      </div>

      <div className="asset-actions">
        {a.viewable3d && <button className="small ghost" onClick={() => onView(a)}>View</button>}
        {a.kind === 'model' && (
          <button className="small" disabled={busy} onClick={() => onConvert(a)} title="Make an optimized GLB for the website">
            {a.area === 'models' ? 'Convert for web' : 'Re-optimize'}
          </button>
        )}
        {a.ref && (
          <button className="small ghost" onClick={() => onCopy(a.ref)}>
            {copied === a.ref ? 'Copied ✓' : 'Copy path'}
          </button>
        )}
        {!a.system && <button className="small danger" onClick={() => onDelete(a)}>Delete</button>}
      </div>
    </div>
  );
}

export default function MediaLibrary({ repo }: { repo: string }) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [postTitles, setPostTitles] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<MediaAsset | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Usage category filter: 'all' | 'unused' | 'other' | a content-area key.
  const [usageFilter, setUsageFilter] = useState('all');

  const refresh = useCallback(() => {
    setError(null);
    listMedia(repo).then(setAssets).catch((e) => setError(String(e)));
  }, [repo]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { checkTools().then(setTools).catch(() => {}); }, []);
  useEffect(() => {
    listPosts(repo)
      .then((ps) => setPostTitles(Object.fromEntries(ps.map((p) => [p.slug, p.title]))))
      .catch(() => {});
  }, [repo]);

  async function doImport(fn: (r: string) => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try { await fn(repo); refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function doDelete(a: MediaAsset) {
    const msg = a.area === 'models'
      ? `Delete source file "${a.name}"?\n\nThis removes the raw 3D file from models/. It isn't on the website.`
      : a.used
        ? `"${a.name}" is still referenced in your content. Deleting it will leave a broken image/link on the site.\n\nDelete anyway?`
        : `Delete "${a.name}"?\n\nIt isn't referenced anywhere, so removing it is safe.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteMedia(repo, a.abs);
      if (viewing?.abs === a.abs) setViewing(null);
      refresh();
    } catch (e) { setError(String(e)); }
  }

  async function doConvert(a: MediaAsset) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const ref = await convertSourceToWebGlb(repo, a.abs);
      setNote(`Converted “${a.name}” → ${ref} (web-ready GLB in public/). Pick it on a project from the Projects tab.`);
      refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function copyPath(ref: string) {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(ref);
      setTimeout(() => setCopied((c) => (c === ref ? null : c)), 1200);
    } catch { /* clipboard unavailable */ }
  }

  const publicAssets = useMemo(() => assets?.filter((a) => a.area === 'public') ?? [], [assets]);
  const blogAssets = useMemo(() => assets?.filter((a) => a.area === 'blog') ?? [], [assets]);
  // Everything the site serves: shared public/ files plus per-post files.
  const servedAssets = useMemo(() => [...publicAssets, ...blogAssets], [publicAssets, blogAssets]);
  const sourceAssets = useMemo(() => assets?.filter((a) => a.area === 'models') ?? [], [assets]);

  const stats = useMemo(() => {
    if (!assets) return null;
    return {
      count: assets.length,
      total: assets.reduce((s, a) => s + a.bytes, 0),
      orphans: servedAssets.filter((a) => !a.used && !a.system).length,
      heavy: servedAssets.filter((a) => a.bytes > HEAVY[a.kind]).length,
    };
  }, [assets, servedAssets]);

  // Category filter chips + counts (only areas that actually have assets show).
  const filterOptions = useMemo(() => {
    const countFor = (key: string) => servedAssets.filter((a) => assetUsageKeys(a).includes(key)).length;
    const opts = [{ key: 'all', label: 'All', count: servedAssets.length }];
    for (const { key, label } of USAGE_AREAS) {
      const c = countFor(key);
      if (c > 0) opts.push({ key, label, count: c });
    }
    for (const key of ['other', 'unused']) {
      const c = countFor(key);
      if (c > 0) opts.push({ key, label: usageLabel(key), count: c });
    }
    return opts;
  }, [servedAssets]);

  // If the active filter's chip disappears (e.g. after deleting the last asset in
  // a category), fall back to "All" so the grid never goes silently empty.
  useEffect(() => {
    if (!filterOptions.some((o) => o.key === usageFilter)) setUsageFilter('all');
  }, [filterOptions, usageFilter]);

  const shownPublic = useMemo(
    () => publicAssets.filter((a) => matchesUsage(a, usageFilter)),
    [publicAssets, usageFilter],
  );

  const shownBlog = useMemo(
    () => blogAssets.filter((a) => matchesUsage(a, usageFilter)),
    [blogAssets, usageFilter],
  );
  const blogByPost = useMemo(() => {
    const m = new Map<string, MediaAsset[]>();
    for (const a of shownBlog) {
      const slug = a.post ?? '';
      m.set(slug, [...(m.get(slug) ?? []), a]);
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [shownBlog]);

  const toolsMissing = tools && (!tools.ffmpeg || !tools.node);

  const cardProps = {
    busy,
    copied,
    onView: setViewing,
    onConvert: doConvert,
    onCopy: copyPath,
    onDelete: doDelete,
  };

  return (
    <div className="app">
      <div className="topbar"><h1 style={{ fontWeight: 400 }}>Media</h1></div>
      <div className="content">
        <div className="container">
          <HelpPanel
            title="How this screen works"
            intro="Everything the project carries lives here. “On the website” is the shared public/ folder the live site serves (keep it lean). “Blog posts” are the images and videos stored inside each post’s own folder. “Source files” are the raw 3D originals (OBJ/STEP) — viewable here but not deployed; convert one to a small GLB when you want it on the site."
            steps={[
              'Use the import buttons below to bring in new files from your computer. In the editors (projects, community, about) you can pick from what’s already here with “Choose…”.',
              'Imports go into the shared public/ folder: images become WebP, videos become MP4, 3D models become GLB, and PDFs or other files are copied as-is.',
              'Each file shows where it’s used (Blog, Projects, Community, About…). Use the filter chips to jump to one area, or to “Unused” files that nothing references — safe to delete. A blog file counts as used when its own post references it.',
              'Click a 3D model — GLB or raw OBJ — to open the viewer; drag to rotate and toggle parts on/off.',
              'On a source model, click “Convert for web” to create a small optimized GLB in public/.',
            ]}
          />

          <details className="help-panel" style={{ marginTop: -6 }}>
            <summary>
              <span className="hp-ico"><Icon name="help" size={16} /></span>
              What should I upload? (formats &amp; sizes)
              <span className="hp-chev"><Icon name="chevron" size={16} /></span>
            </summary>
            <div className="hp-body">
              <ul className="tips">
                <li><b>Photos:</b> a normal JPG/PNG from a phone or camera. <b>Don’t</b> upload 4K / “full resolution” exports — they don’t look better on the web and slow the site down. Imports are auto-resized to 1920px and converted to WebP.</li>
                <li><b>Logos / graphics:</b> PNG, or SVG for crisp logos.</li>
                <li><b>Videos:</b> short clips work best; imports are re-encoded to 1080p MP4. For long videos, link YouTube instead.</li>
                <li><b>3D models:</b> a STEP, OBJ, or GLB. Raw OBJ/STEP stay as <i>source</i> (not shipped); “Convert for web” makes a small GLB (a 10&nbsp;MB OBJ becomes ~1.5&nbsp;MB).</li>
                <li><b>Other files:</b> use <b>Import file</b> for odds and ends (.docx, .ork, .zip…). They’re stored for download/linking, not shown inline — grab their path with “Copy path”.</li>
                <li><b>Rule of thumb:</b> images under ~700&nbsp;KB, clips under ~12&nbsp;MB. The library flags anything heavier.</li>
              </ul>
            </div>
          </details>

          {toolsMissing && (
            <div className="notice warn">
              {!tools?.ffmpeg && 'ffmpeg isn’t installed, so imported photos/videos are copied at full size instead of compressed. '}
              {!tools?.node && 'Node.js isn’t available, so OBJ/STEP can’t be converted to web GLB. '}
              Install the missing tool, or keep uploads small.
            </div>
          )}
          {note && <div className="notice ok" style={{ whiteSpace: 'normal' }}>{note}</div>}
          {error && <div className="notice error">{error}</div>}

          <div className="media-actions">
            <button className="small" disabled={busy} onClick={() => doImport(importPublicImage)}>＋ Import image</button>
            <button className="small" disabled={busy} onClick={() => doImport(importPublicVideo)}>＋ Import video</button>
            <button className="small" disabled={busy} onClick={() => doImport(importPublicModel)}>＋ Import 3D model</button>
            <button className="small" disabled={busy} onClick={() => doImport((r) => importPublicFile(r, ['pdf']))}>＋ Import PDF</button>
            <button className="small" disabled={busy} onClick={() => doImport(importPublicAnyFile)}>＋ Import file</button>
            <button className="small ghost" disabled={busy} onClick={refresh}>Refresh</button>
          </div>

          {stats && (
            <div className="media-stats">
              <span><b>{stats.count}</b> files</span>
              <span><b>{fmtBytes(stats.total)}</b> total</span>
              {stats.orphans > 0 && <span className="ms-warn"><b>{stats.orphans}</b> unused</span>}
              {stats.heavy > 0 && <span className="ms-warn"><b>{stats.heavy}</b> large</span>}
            </div>
          )}

          {filterOptions.length > 2 && (
            <div className="filter-chips" role="tablist" aria-label="Filter assets by where they're used">
              {filterOptions.map((o) => (
                <button
                  key={o.key}
                  role="tab"
                  aria-selected={usageFilter === o.key}
                  className={`chip${usageFilter === o.key ? ' on' : ''}`}
                  onClick={() => setUsageFilter(o.key)}
                >
                  {o.label} <span className="chip-n">{o.count}</span>
                </button>
              ))}
            </div>
          )}

          {!assets ? (
            <div className="empty">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="empty">No files yet. Use the import buttons above.</div>
          ) : (
            <>
              <div className="area-head">
                On the website <span className="area-sub">public/ · served to visitors</span>
                {usageFilter !== 'all' && (
                  <span className="area-sub">· showing {usageLabel(usageFilter)} ({shownPublic.length})</span>
                )}
              </div>
              {shownPublic.length === 0 ? (
                shownBlog.length === 0 && <div className="empty">No files match this filter.</div>
              ) : (
                GROUPS.map(({ kind, label, icon }) => {
                  const items = shownPublic.filter((a) => a.kind === kind);
                  if (items.length === 0) return null;
                  return (
                    <div key={kind}>
                      <div className="section-title sub-title"><Icon name={icon} size={15} /> {label} ({items.length})</div>
                      <div className="media-grid">{items.map((a) => <Card key={a.abs} a={a} {...cardProps} />)}</div>
                    </div>
                  );
                })
              )}

              {(blogAssets.length > 0) && shownBlog.length > 0 && (
                <>
                  <div className="area-head" style={{ marginTop: 34 }}>
                    Blog posts <span className="area-sub">src/content/blog/&lt;post&gt;/ · each post’s own files</span>
                    {usageFilter !== 'all' && (
                      <span className="area-sub">· showing {usageLabel(usageFilter)} ({shownBlog.length})</span>
                    )}
                  </div>
                  {blogByPost.map(([slug, items]) => (
                    <div key={slug}>
                      <div className="section-title sub-title" title={slug}>
                        <Icon name="blog" size={15} /> {postTitles[slug] || slug} ({items.length})
                        {postTitles[slug] && <span className="area-sub"> · {slug}</span>}
                      </div>
                      <div className="media-grid">{items.map((a) => <Card key={a.abs} a={a} {...cardProps} />)}</div>
                    </div>
                  ))}
                </>
              )}

              {/* Source files (raw 3D aren't served, so usage categories don't
                  apply — only surface them when nothing is filtered. */}
              {usageFilter === 'all' && sourceAssets.length > 0 && (
                <>
                  <div className="area-head" style={{ marginTop: 34 }}>
                    Source files <span className="area-sub">models/ · raw 3D, not deployed</span>
                  </div>
                  <div className="media-grid">{sourceAssets.map((a) => <Card key={a.abs} a={a} {...cardProps} />)}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {viewing && (
        <ModelViewerModal
          asset={viewing}
          busy={busy}
          onConvert={viewing.area === 'models' ? () => doConvert(viewing) : undefined}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
