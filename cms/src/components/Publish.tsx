import { useCallback, useEffect, useState } from 'react';
import {
  gitSyncStatus,
  gitStatus,
  gitCommit,
  gitFetch,
  gitMergeRemote,
  gitPush,
  gitLog,
  gitRevert,
  type GitSyncStatus,
  type GitCommitInfo,
} from '../api';
import ConflictResolver from './ConflictResolver';

/**
 * Publish panel. One button does the whole safe sequence — save (commit) →
 * check for changes made on another computer (fetch) → merge them in → push — so
 * a stale checkout can never overwrite newer work with a rejected/forced push.
 * When a merge hits a real conflict, we hand off to ConflictResolver instead of
 * ever leaving conflict markers in the files. A history list lets the owner undo
 * a previous change safely (a new reverse commit, never a history rewrite).
 */
const DEFAULT_MESSAGE = 'content update';

export default function Publish({ repo }: { repo: string }) {
  const [sync, setSync] = useState<GitSyncStatus | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [revertPending, setRevertPending] = useState<GitCommitInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([gitSyncStatus(repo), gitStatus(repo)]);
      setSync(s);
      setChanges(st.changes);
      if (s.merging && s.conflicted.length) setConflicts(s.conflicted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo]);

  const loadHistory = useCallback(async () => {
    try { setHistory(await gitLog(repo, 15)); } catch { /* non-fatal */ }
  }, [repo]);

  useEffect(() => { refresh(); loadHistory(); }, [refresh, loadHistory]);

  const step = (s: string) => setSteps((prev) => [...prev, s]);

  /** fetch → (merge if behind) → push. Returns false if it stopped at a conflict. */
  async function syncAndPush(): Promise<boolean> {
    step('Checking for changes from another computer…');
    await gitFetch(repo);
    const s = await gitSyncStatus(repo);
    setSync(s);
    if (s.hasUpstream && s.behind > 0) {
      step(`Merging in ${s.behind} update${s.behind === 1 ? '' : 's'} from another computer…`);
      const merge = await gitMergeRemote(repo);
      if (!merge.ok) {
        step('Found overlapping edits — let’s merge them together below.');
        setConflicts(merge.conflicted);
        return false;
      }
      step('Merged cleanly.');
    }
    step('Publishing…');
    await gitPush(repo);
    step('Published — Render will redeploy the site in a minute or two. ✅');
    return true;
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      const pre = await gitSyncStatus(repo);
      if (pre.merging || pre.conflicted.length) {
        setConflicts(pre.conflicted);
        throw new Error('A merge is still in progress — finish or cancel it below before publishing.');
      }
      const st = await gitStatus(repo);
      if (!st.clean) {
        step('Saving your changes…');
        await gitCommit(repo, message.trim() || DEFAULT_MESSAGE);
      }
      const s = await gitSyncStatus(repo);
      if (st.clean && s.ahead === 0 && s.behind === 0) {
        step('Everything is already published — nothing to do.');
        return;
      }
      await syncAndPush();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refresh();
      await loadHistory();
    }
  }

  async function doRevert(commit: GitCommitInfo) {
    setRevertPending(null);
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      step(`Undoing “${commit.subject}”…`);
      await gitRevert(repo, commit.hash);
      await syncAndPush();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refresh();
      await loadHistory();
    }
  }

  async function onMergeDone() {
    setConflicts(null);
    setSteps((prev) => [...prev, 'Merged and published — Render will redeploy the site in a minute or two. ✅']);
    await refresh();
    await loadHistory();
  }

  async function onMergeAbort() {
    setConflicts(null);
    setSteps(['Merge canceled. Your changes are still saved on your computer — nothing was published.']);
    await refresh();
  }

  // Conflict mode takes over the whole tab until the merge is finished/canceled.
  if (conflicts && conflicts.length) {
    return (
      <div className="app">
        <div className="topbar">
          <h1 style={{ fontWeight: 400 }}>Publish · Merge changes</h1>
        </div>
        <div className="content">
          <ConflictResolver
            repo={repo}
            conflicted={conflicts}
            onFinished={onMergeDone}
            onAbort={onMergeAbort}
          />
        </div>
      </div>
    );
  }

  const upToDate = sync && sync.clean && sync.ahead === 0 && sync.behind === 0;

  return (
    <div className="app">
      <div className="topbar">
        <h1 style={{ fontWeight: 400 }}>Publish</h1>
        <div className="spacer" />
        <button className="small ghost" onClick={() => { refresh(); loadHistory(); }} disabled={busy}>
          Check for updates
        </button>
      </div>

      <div className="content">
        <div className="container">
          <p className="muted" style={{ marginTop: 0 }}>
            Publishing saves your changes, pulls in anything published from another computer, and pushes so
            Render redeploys the site — all in one step.
            {sync && <> Branch: <code>{sync.branch || '—'}</code>.</>}
          </p>

          {sync && (
            <div className={`sync-pill ${sync.behind > 0 ? 'warn' : upToDate ? 'ok' : 'info'}`}>
              {sync.behind > 0 ? (
                <>⟳ {sync.behind} update{sync.behind === 1 ? '' : 's'} from another computer — these get merged in when you publish.</>
              ) : upToDate ? (
                <>✓ Up to date. Nothing to publish.</>
              ) : (
                <>{changes.length > 0
                  ? <>You have saved changes that aren't published yet.</>
                  : <>{sync.ahead} change{sync.ahead === 1 ? '' : 's'} ready to publish.</>}
              </>
              )}
            </div>
          )}

          <div className="field" style={{ marginBottom: 12, marginTop: 14 }}>
            <label>Describe your change (optional)</label>
            <input
              value={message}
              placeholder={DEFAULT_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) publish(); }}
            />
          </div>

          <div className="row" style={{ marginBottom: 18 }}>
            <button className="primary" disabled={busy || (!!upToDate)} onClick={publish}>
              {busy ? 'Working…' : 'Publish changes'}
            </button>
          </div>

          {error && (
            <div className="notice error">
              {error}
              <div className="muted" style={{ marginTop: 6 }}>
                Nothing was forced or lost. Click “Check for updates” and try Publish again.
              </div>
            </div>
          )}
          {steps.length > 0 && (
            <div className="notice ok publish-steps">
              {steps.map((s, i) => <div key={i}>{s}</div>)}
            </div>
          )}

          <div className="section-title">
            {changes.length > 0 ? `Not yet published (${changes.length})` : 'Changes'}
          </div>
          {sync === null ? (
            <div className="empty">Loading…</div>
          ) : changes.length === 0 ? (
            <div className="empty">Nothing changed since your last publish.</div>
          ) : (
            <pre className="git-changes">{changes.map(describeChange).join('\n')}</pre>
          )}

          <div className="section-title" style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            Recent changes
            <button className="small ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Hide' : 'Show'}
            </button>
          </div>
          {showHistory && (
            <div className="history-list">
              {history.length === 0 && <div className="empty">No history yet.</div>}
              {history.map((c) => (
                <div key={c.hash} className="history-row">
                  <div className="history-main">
                    <div className="history-subject">{c.subject}</div>
                    <div className="muted history-meta">{c.author} · {c.when}</div>
                  </div>
                  {revertPending?.hash === c.hash ? (
                    <div className="row">
                      <button className="small danger" disabled={busy} onClick={() => doRevert(c)}>
                        Undo &amp; publish
                      </button>
                      <button className="small ghost" disabled={busy} onClick={() => setRevertPending(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="small ghost" disabled={busy} onClick={() => setRevertPending(c)}>
                      Undo…
                    </button>
                  )}
                </div>
              ))}
              {revertPending && (
                <div className="muted revert-hint">
                  “Undo” adds a new change that reverses “{revertPending.subject}”. It never deletes history and
                  never touches other work.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "XY path" from `git status --porcelain` → "modified  path" (the first line arrives trimmed). */
function describeChange(line: string): string {
  const m = line.match(/^\s*(\S{1,2})\s+(.*)$/);
  if (!m) return line;
  const code = m[1];
  const kind = code === '??' || code.includes('A') ? 'new' : code.includes('D') ? 'deleted' : code.includes('R') ? 'renamed' : 'modified';
  return `${kind.padEnd(9)}${m[2]}`;
}
