import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  listMedia, assetUsageKeys, matchesUsage, usageLabel, USAGE_AREAS,
  type MediaAsset, type MediaKind,
} from '../api';
import { Icon } from './icons';

/**
 * Browse-and-pick for assets that already live in the repo. Importing files
 * from outside only happens in the Media tab; everywhere else, fields call
 * `pickAsset(...)` to choose from what's already there. This keeps a single,
 * understandable place where new files enter the project.
 */

export type PickFilter = {
  /** Restrict to these asset kinds (image/video/model/other). */
  kinds?: MediaKind[];
  /** Restrict to these file extensions (e.g. ['pdf']). */
  exts?: string[];
  /** Modal heading. */
  title?: string;
  /** Blog post slug: pick only from that post's own assets/videos (refs are
   *  post-relative, e.g. "assets/foo.jpg"). Without it, the site's public/ files. */
  post?: string;
};

type Ctx = { pickAsset: (f: PickFilter) => Promise<string | null> };
const PickerContext = createContext<Ctx | null>(null);

export function useAssetPicker(): Ctx {
  const ctx = useContext(PickerContext);
  if (!ctx) throw new Error('useAssetPicker must be used within an AssetPickerProvider');
  return ctx;
}

export function AssetPickerProvider({ repo, children }: { repo: string; children: ReactNode }) {
  const [filter, setFilter] = useState<PickFilter | null>(null);
  const resolverRef = useRef<((ref: string | null) => void) | null>(null);

  const pickAsset = useCallback(
    (f: PickFilter) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setFilter(f);
      }),
    [],
  );

  const finish = useCallback((ref: string | null) => {
    resolverRef.current?.(ref);
    resolverRef.current = null;
    setFilter(null);
  }, []);

  return (
    <PickerContext.Provider value={{ pickAsset }}>
      {children}
      {filter && <AssetPickerModal repo={repo} filter={filter} onPick={finish} />}
    </PickerContext.Provider>
  );
}

function AssetPickerModal({
  repo, filter, onPick,
}: {
  repo: string;
  filter: PickFilter;
  onPick: (ref: string | null) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [q, setQ] = useState('');
  // Usage category filter: 'all' | 'unused' | 'other' | a content-area key.
  const [usageFilter, setUsageFilter] = useState('all');

  useEffect(() => {
    listMedia(repo).then(setAssets).catch(() => setAssets([]));
  }, [repo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onPick(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick]);

  // Pickable pool for this field (served files matching the kind/ext filter),
  // before the usage/search filters — this is what the category chips count.
  const pool = useMemo(() => {
    let list = (assets ?? []).filter((a) =>
      (filter.post ? a.area === 'blog' && a.post === filter.post : a.area === 'public') && a.ref && !a.system);
    if (filter.kinds) list = list.filter((a) => filter.kinds!.includes(a.kind));
    if (filter.exts) list = list.filter((a) => filter.exts!.includes(a.ext));
    return list;
  }, [assets, filter]);

  const filterOptions = useMemo(() => {
    const countFor = (key: string) => pool.filter((a) => assetUsageKeys(a).includes(key)).length;
    const opts = [{ key: 'all', label: 'All', count: pool.length }];
    for (const { key, label } of USAGE_AREAS) {
      const c = countFor(key);
      if (c > 0) opts.push({ key, label, count: c });
    }
    for (const key of ['other', 'unused']) {
      const c = countFor(key);
      if (c > 0) opts.push({ key, label: usageLabel(key), count: c });
    }
    return opts;
  }, [pool]);

  useEffect(() => {
    if (!filterOptions.some((o) => o.key === usageFilter)) setUsageFilter('all');
  }, [filterOptions, usageFilter]);

  const matches = useMemo(() => {
    let list = pool.filter((a) => matchesUsage(a, usageFilter));
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((a) => a.name.toLowerCase().includes(needle));
    return list;
  }, [pool, usageFilter, q]);

  return (
    <div className="viewer-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onPick(null); }}>
      <div className="vm-panel picker-panel">
        <div className="vm-top">
          <div className="vm-title"><Icon name="media" size={16} /> {filter.title || 'Choose an asset'}</div>
          <div className="vm-top-actions">
            <button className="small ghost" onClick={() => onPick(null)}>Cancel ✕</button>
          </div>
        </div>

        <div className="picker-toolbar">
          <input autoFocus placeholder="Search assets…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="picker-hint">
            {filter.post
              ? <>Showing only this post’s own files (its assets and videos folders).</>
              : <>Need a new file? Import it in the <b>Media</b> tab first.</>}
          </span>
          {filterOptions.length > 2 && (
            <div className="filter-chips picker-filters" role="tablist" aria-label="Filter by where the asset is used">
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
        </div>

        <div className="picker-body">
          {!assets ? (
            <div className="empty">Loading…</div>
          ) : matches.length === 0 ? (
            <div className="empty">
              No matching files yet.<br />
              {filter.post
                ? <>This post has no matching files in its assets/videos folders.</>
                : <>Import them in the <b>Media</b> tab, then come back and pick one.</>}
            </div>
          ) : (
            <div className="picker-grid">
              {matches.map((a) => (
                <button key={a.abs} className="picker-card" onClick={() => onPick(a.ref)} title={a.ref}>
                  <div className="picker-thumb">
                    {a.kind === 'image' && <img src={a.url} alt="" loading="lazy" />}
                    {a.kind === 'video' && <video src={a.url} muted preload="metadata" />}
                    {a.kind === 'model' && <Icon name="cube" size={24} />}
                    {a.kind === 'other' && <Icon name="file" size={24} />}
                    {a.usedIn.length > 0 && (
                      <span className="picker-badge" title={`Already used in: ${a.usedIn.map(usageLabel).join(', ')}`}>in use</span>
                    )}
                  </div>
                  <div className="picker-name">{a.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
