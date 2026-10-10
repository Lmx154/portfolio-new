import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Collection } from '../api';
import { ItemToolbar } from './fields';
import HelpPanel from './HelpPanel';
import { slugify } from '../util';

/**
 * Reusable scaffold for any list of records backed by a `Collection` (one JSON
 * file per record, or an array inside a single file). Handles the boilerplate
 * shared by every list editor: load, list, add, edit, save-all, delete, search,
 * collapse, bulk delete, and (optionally) manual ordering — so each concrete
 * editor only provides how to render one record's fields.
 */
export default function CollectionEditor<T extends object>({
  repo,
  title,
  hint,
  guide,
  api,
  makeSeed,
  autoId,
  newTitleLabel = 'Name',
  newButtonLabel = '＋ New',
  emptyText = 'Nothing yet. Add one.',
  displayName,
  renderItem,
  sort,
  reorderable,
  sortModes,
}: {
  repo: string;
  title: string;
  hint?: string;
  /** Optional "How this screen works" panel shown above the hint. */
  guide?: { intro?: string; steps?: string[] };
  api: Collection<T>;
  /** Build a new record from the create form's id + name. `items` is the current list (e.g. to pick the next order). */
  makeSeed: (id: string, name: string, items: T[]) => unknown;
  /** Generate ids instead of asking for one (hides the id field in the create form). */
  autoId?: () => string;
  newTitleLabel?: string;
  newButtonLabel?: string;
  emptyText?: string;
  displayName: (item: T) => string;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  /** Initial order on load (ignored for `reorderable` lists, which keep the saved order). */
  sort?: (a: T, b: T) => number;
  /**
   * Manual ordering: cards get ↑/↓ buttons; Save persists the new order through
   * `api.reorder`. Use for lists whose on-site order is author-controlled.
   */
  reorderable?: boolean;
  /**
   * View-only "Sort by" categories, for records with no manual order.
   * Mutually exclusive with `reorderable`. The first entry is the default.
   */
  sortModes?: { key: string; label: string; cmp: (a: T, b: T) => number }[];
}) {
  const idOf = (item: T): string => String((item as Record<string, unknown>)[api.idKey]);
  /** Records that live in their own `<id>.json` file (vs. entries of one shared file). */
  const perFile = !api.REL.endsWith('.json');

  const [items, setItems] = useState<T[] | null>(null);
  // Last saved state (id → JSON, plus id order) so Save only writes what actually changed.
  const saved = useRef<{ json: Map<string, string>; order: string[] }>({ json: new Map(), order: [] });
  const snapshot = (list: T[]) => {
    saved.current = { json: new Map(list.map((x) => [idOf(x), JSON.stringify(x)])), order: list.map(idOf) };
  };
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  // Find / focus: filter the list, collapse cards to just name+id, and select
  // several at once for bulk delete.
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // View-only sort category; defaults to the first mode.
  const [sortKey, setSortKey] = useState<string>(sortModes?.[0]?.key ?? '');

  function reload() {
    return api
      .list(repo)
      .then((list) => {
        const sorted = sort && !reorderable ? [...list].sort(sort) : list;
        setItems(sorted);
        snapshot(sorted);
        // Start compact: every card collapsed to name + id. Editing expands it.
        setCollapsed(new Set(sorted.map(idOf)));
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  function update(id: string, patch: Partial<T>) {
    setItems((xs) => xs?.map((x) => (idOf(x) === id ? { ...x, ...patch } : x)) ?? xs);
    setMsg(null);
  }

  /** Move one record up/down in the manual order (reorderable lists only). */
  function move(id: string, dir: -1 | 1) {
    setItems((xs) => {
      if (!xs) return xs;
      const i = xs.findIndex((x) => idOf(x) === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setMsg(null);
  }

  async function saveAll() {
    if (!items) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const changed = items.filter((x) => saved.current.json.get(idOf(x)) !== JSON.stringify(x));
      for (const item of changed) await api.save(repo, item);
      const ids = items.map(idOf);
      const known = new Set(saved.current.order);
      const prevOrder = saved.current.order.filter((id) => ids.includes(id));
      const reordered = reorderable && ids.filter((id) => known.has(id)).some((id, i) => id !== prevOrder[i]);
      if (reordered) await api.reorder(repo, ids);
      // Pick up the values just written (e.g. order numbers), keeping the cards' collapse state.
      const fresh = changed.length || reordered ? await api.list(repo) : items;
      setItems(fresh);
      snapshot(fresh);
      setMsg(changed.length || reordered ? 'Saved ✓' : 'Nothing to save — no changes.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeOne(item: T) {
    if (!confirm(`Delete ${api.label} “${displayName(item)}”? ${perFile ? 'This removes its JSON file.' : 'This removes it from the list.'}`)) return;
    try {
      await api.remove(repo, idOf(item));
      setItems((xs) => xs?.filter((x) => idOf(x) !== idOf(item)) ?? xs);
      dropFromSets(idOf(item));
      setMsg(`Deleted “${displayName(item)}”.`);
    } catch (e) {
      setError(String(e));
    }
  }

  /** Remove an id from the collapse/select sets after its record is gone. */
  function dropFromSets(id: string) {
    setSelected((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setCollapsed((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} ${api.label}${ids.length === 1 ? '' : 's'}? ${perFile ? 'This removes their JSON files and' : 'This'} can’t be undone.`))
      return;
    setBulkBusy(true);
    setError(null);
    setMsg(null);
    const done: string[] = [];
    let failure: string | null = null;
    for (const id of ids) {
      try {
        await api.remove(repo, id);
        done.push(id);
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
        break; // stop on first failure; report how far we got
      }
    }
    if (done.length) {
      const gone = new Set(done);
      setItems((xs) => xs?.filter((x) => !gone.has(idOf(x))) ?? xs);
      setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
      setCollapsed((s) => new Set([...s].filter((id) => !gone.has(id))));
    }
    if (failure) setError(`Deleted ${done.length} of ${ids.length}. Stopped on error: ${failure}`);
    else setMsg(`Deleted ${done.length} ${api.label}${done.length === 1 ? '' : 's'}.`);
    setBulkBusy(false);
  }

  async function create() {
    const id = autoId ? autoId() : newSlug || slugify(newName);
    setError(null);
    try {
      const created = (await api.create(repo, makeSeed(id, newName.trim(), items ?? []))) as T;
      // New records land at the end of the list.
      setItems((xs) => [...(xs ?? []), created]);
      // It's already on disk (at the end), so track it as saved — a later move is then a real reorder.
      saved.current.json.set(idOf(created), JSON.stringify(created));
      saved.current.order = [...saved.current.order, idOf(created)];
      setShowNew(false);
      setNewName('');
      setNewSlug('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const q = query.trim().toLowerCase();
  const activeSort = sortModes?.find((m) => m.key === sortKey)?.cmp ?? sortModes?.[0]?.cmp;
  const matched = (items ?? []).filter(
    (it) => !q || displayName(it).toLowerCase().includes(q) || idOf(it).toLowerCase().includes(q),
  );
  // `sortModes` re-sorts the view live; otherwise keep the (manual/load) order.
  const filtered = activeSort ? [...matched].sort(activeSort) : matched;
  const allCollapsed = filtered.length > 0 && filtered.every((it) => collapsed.has(idOf(it)));
  const selectedInView = filtered.filter((it) => selected.has(idOf(it))).length;
  const allFilteredSelected = filtered.length > 0 && selectedInView === filtered.length;

  function toggleIn(setState: typeof setCollapsed, id: string) {
    setState((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllCollapsed() {
    setCollapsed((s) => {
      if (allCollapsed) return new Set<string>(); // expand all
      const n = new Set(s);
      filtered.forEach((it) => n.add(idOf(it)));
      return n;
    });
  }
  function toggleSelectAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) filtered.forEach((it) => n.delete(idOf(it)));
      else filtered.forEach((it) => n.add(idOf(it)));
      return n;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1 style={{ fontWeight: 400 }}>{title}</h1>
        <div className="spacer" />
        {items && items.length > 0 && (
          <>
            <button
              className="small ghost"
              title="Select several records to delete at once"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? '✕ Done' : '☑ Select'}
            </button>
            <button className="small ghost" title="Collapse or expand every card" onClick={toggleAllCollapsed}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          </>
        )}
        <button className="small ghost" onClick={() => setShowNew((v) => !v)}>{newButtonLabel}</button>
        <button className="primary small" onClick={saveAll} disabled={!items || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="content">
        <div className="container">
          {guide && <HelpPanel intro={guide.intro} steps={guide.steps} />}
          {hint && <p className="screen-hint">{hint}</p>}

          {showNew && (
            <div className="inline-form">
              <div>
                <label>{newTitleLabel}</label>
                <input
                  value={newName}
                  autoFocus
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewSlug(slugify(e.target.value));
                  }}
                  placeholder={newTitleLabel}
                />
              </div>
              {!autoId && (
                <div>
                  <label>Id (file name)</label>
                  <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="kebab-case-id" />
                </div>
              )}
              <div className="row">
                <button className="primary" disabled={!newName.trim() || (!autoId && !newSlug)} onClick={create}>Create</button>
                <button className="ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </div>
          )}

          {error && <div className="notice error">{error}</div>}
          {msg && <div className="notice ok">{msg}</div>}

          {items && items.length > 1 && (
            <div className="list-search">
              <input
                type="search"
                placeholder={`Search ${title.toLowerCase()} by name or id…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {sortModes && sortModes.length > 0 && (
                <label className="list-sort">
                  Sort by
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                    {sortModes.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {q && (
                <span className="list-count">
                  {filtered.length} / {items.length}
                </span>
              )}
            </div>
          )}

          {selectMode && items && items.length > 0 && (
            <div className="bulk-bar">
              <label className="bulk-all">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                Select all{q ? ' matching' : ''}
              </label>
              <div className="spacer" />
              <span className="bulk-count">{selected.size} selected</span>
              <button className="small ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button className="small danger" disabled={!selected.size || bulkBusy} onClick={bulkDelete}>
                {bulkBusy ? 'Deleting…' : `Delete ${selected.size || ''}`.trim()}
              </button>
            </div>
          )}

          {items === null ? (
            <div className="empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty">{emptyText}</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No matches for “{query.trim()}”.</div>
          ) : (
            <div
              {...(saving ? { inert: '' } : {})}
              style={saving ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
            >
            {filtered.map((item, idx) => {
              const id = idOf(item);
              const isCollapsed = collapsed.has(id);
              const isSelected = selected.has(id);
              return (
                <div className={`tile${isSelected ? ' selected' : ''}`} key={id}>
                  <div className="tile-head">
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="tile-check"
                        checked={isSelected}
                        onChange={() => toggleIn(setSelected, id)}
                        aria-label={`Select ${displayName(item) || id}`}
                      />
                    )}
                    {reorderable && !selectMode && !q && (
                      <span className="tile-reorder">
                        <button className="small ghost" title="Move up" disabled={idx === 0} onClick={() => move(id, -1)}>↑</button>
                        <button className="small ghost" title="Move down" disabled={idx === filtered.length - 1} onClick={() => move(id, 1)}>↓</button>
                      </span>
                    )}
                    <button
                      className="small ghost tile-collapse"
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                      onClick={() => toggleIn(setCollapsed, id)}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                    <span className="tile-title tile-toggle" onClick={() => toggleIn(setCollapsed, id)}>
                      {displayName(item) || id}
                    </span>
                    {!autoId && <span className="block-id">{perFile ? `${id}.json` : id}</span>}
                    {!selectMode && <ItemToolbar onDelete={() => removeOne(item)} />}
                  </div>
                  {!isCollapsed && renderItem(item, (patch) => update(id, patch))}
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
