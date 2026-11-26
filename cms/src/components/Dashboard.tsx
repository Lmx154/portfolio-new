import { useCallback, useEffect, useState } from 'react';
import { listPosts, createPost, deletePost, movePost, type PostSummary } from '../api';

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function Dashboard({
  repo,
  onOpenPost,
}: {
  repo: string;
  onOpenPost: (slug: string) => void;
}) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setPosts(await listPosts(repo));
    } catch (e) {
      setError(String(e));
    }
  }, [repo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const slug = newSlug || slugify(newTitle);
      await createPost(repo, slug, newTitle.trim());
      setShowNew(false);
      setNewTitle('');
      setNewSlug('');
      onOpenPost(slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function move(post: PostSummary, direction: -1 | 1) {
    setMoving(true);
    setError(null);
    try {
      await movePost(repo, post.slug, direction);
      await refresh();
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoving(false);
    }
  }

  async function remove(p: PostSummary) {
    if (!confirm(`Delete blog post “${p.title}”? This removes its folder and assets.`)) return;
    setError(null);
    try {
      await deletePost(repo, p.slug);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1 style={{ fontWeight: 400 }}>Blog</h1>
        <div className="spacer" />
        <button className="small ghost" disabled={moving} onClick={refresh}>Refresh</button>
      </div>

      <div className="content">
        <div className="container">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 style={{ fontWeight: 400, margin: 0 }}>Blog posts</h2>
            <button className="primary small" disabled={moving} onClick={() => setShowNew((v) => !v)}>＋ New post</button>
          </div>

          {showNew && (
            <div className="inline-form">
              <div>
                <label>Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setNewSlug(slugify(e.target.value));
                  }}
                  placeholder="My New Post"
                />
              </div>
              <div>
                <label>Slug (folder name)</label>
                <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="my-new-post" />
              </div>
              <div className="row">
                <button className="primary" disabled={creating || moving || !newTitle.trim() || !newSlug} onClick={create}>
                  Create draft
                </button>
                <button className="ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </div>
          )}

          {error && <div className="notice error">{error}</div>}

          {posts === null ? (
            <div className="empty">Loading…</div>
          ) : posts.length === 0 ? (
            <div className="empty">No posts yet. Create your first draft.</div>
          ) : (
            <table className="posts">
              <thead>
                <tr>
                  <th title="Move posts within the same publication date">Order</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Blocks</th>
                  <th>Tags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {posts.map((p, index) => (
                  <tr key={p.slug}>
                    <td>
                      <span className="tile-reorder">
                        {([-1, 1] as const).map((direction) => {
                          const adjacent = posts[index + direction];
                          const label = direction === -1 ? 'Move up' : 'Move down';
                          return (
                            <button
                              key={direction}
                              className="small ghost"
                              title={`${label} within the same date`}
                              aria-label={`${label}: ${p.title}`}
                              disabled={moving || !p.valid || !p.date || !adjacent?.valid || adjacent.date !== p.date}
                              onClick={() => move(p, direction)}
                            >
                              {direction === -1 ? '↑' : '↓'}
                            </button>
                          );
                        })}
                      </span>
                    </td>
                    <td className="title">
                      {p.title}
                      <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{p.slug}</div>
                    </td>
                    <td>
                      {p.valid ? (
                        <span className={`badge ${p.status}`}>{p.status}</span>
                      ) : (
                        <span className="badge invalid" title={p.error}>invalid</span>
                      )}
                    </td>
                    <td className="muted">{p.displayDate || p.date || '—'}</td>
                    <td className="muted">{p.blockCount}</td>
                    <td>
                      <div className="tags">
                        {p.tags.slice(0, 4).map((t) => <span key={t} className="tag">{t}</span>)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="item-tools" style={{ justifyContent: 'flex-end' }}>
                        <button className="small" disabled={moving} onClick={() => onOpenPost(p.slug)}>Open</button>
                        <button className="small danger" disabled={moving} onClick={() => remove(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
