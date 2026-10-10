import { useCallback, useEffect, useRef, useState } from 'react';
import {
  gitConflictVersions,
  gitResolveFile,
  gitResolveSide,
  gitMergeContinue,
  gitMergeAbort,
  gitPush,
  ollamaChat,
  ollamaModels,
  validateResolvedContent,
  type ChatMessage,
  type ConflictVersions,
} from '../api';
import {
  conflictSystemPrompt,
  extractJson,
  friendlyName,
  getOllamaBase,
  getOllamaModel,
  setOllamaBase,
  setOllamaModel,
  tryPretty,
  DEFAULT_OLLAMA_BASE,
} from '../ollama';

/**
 * Shown in the Publish tab only when a sync left real merge conflicts (the same
 * content was edited on two computers). Walks a non-technical editor through merging
 * each file — with quick "keep mine / keep theirs" buttons and a local-model
 * (Ollama / Gemma) chat that proposes a combined version — then finishes the
 * merge and publishes. Nothing is ever pushed until every file is resolved, and
 * "Cancel" fully backs the merge out with the editor's own work intact.
 */
export default function ConflictResolver({
  repo,
  conflicted,
  onFinished,
  onAbort,
}: {
  repo: string;
  conflicted: string[];
  onFinished: () => void;
  onAbort: () => void;
}) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [base, setBase] = useState<string>(getOllamaBase());
  const [model, setModel] = useState<string>(getOllamaModel());
  const [models, setModels] = useState<string[]>([]);
  const [aiReachable, setAiReachable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | 'finish' | 'abort'>(null);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    try {
      const list = await ollamaModels(base);
      setModels(list);
      setAiReachable(true);
      if (list.length && !list.includes(model)) {
        setModel(list[0]);
        setOllamaModel(list[0]);
      }
    } catch {
      setModels([]);
      setAiReachable(false);
    }
  }, [base, model]);

  useEffect(() => { probe(); }, [probe]);

  const markResolved = useCallback((path: string) => {
    setResolved((prev) => new Set(prev).add(path));
  }, []);

  const allDone = conflicted.every((f) => resolved.has(f));

  async function finish() {
    setBusy('finish');
    setError(null);
    try {
      const cont = await gitMergeContinue(repo);
      if (!cont.ok) {
        setError('Some files still need resolving: ' + (cont.conflicted || []).join(', '));
        setBusy(null);
        return;
      }
      await gitPush(repo);
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function abort() {
    setBusy('abort');
    setError(null);
    try {
      await gitMergeAbort(repo);
      onAbort();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container">
      <div className="notice merge-banner">
        <strong>The same content was edited on another computer while you were working.</strong>
        <div className="muted" style={{ marginTop: 4 }}>
          Nothing is lost and nothing is live yet. Merge each item below — keep yours, keep theirs, or
          let the assistant combine them — then publish. You can cancel any time and your work stays saved.
        </div>
      </div>

      <div className="ai-settings">
        <div className="field">
          <label>Merge assistant model (local Ollama)</label>
          {aiReachable && models.length ? (
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); setOllamaModel(e.target.value); }}
            >
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              value={model}
              onChange={(e) => { setModel(e.target.value); setOllamaModel(e.target.value); }}
              placeholder="e.g. gemma3:4b"
            />
          )}
        </div>
        <div className="field">
          <label>Ollama server</label>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            onBlur={() => { setOllamaBase(base); probe(); }}
            placeholder={DEFAULT_OLLAMA_BASE}
          />
        </div>
        <div className="ai-status">
          {aiReachable === null && <span className="muted">Checking assistant…</span>}
          {aiReachable === true && <span className="ok-text">● Assistant ready</span>}
          {aiReachable === false && (
            <span className="muted">
              Assistant offline — you can still use “Keep mine / Keep theirs”. Start it with <code>ollama serve</code>.
            </span>
          )}
        </div>
      </div>

      <div className="section-title">
        Items to merge — {resolved.size}/{conflicted.length} done
      </div>

      {conflicted.map((path) => (
        <ConflictFile
          key={path}
          repo={repo}
          path={path}
          base={base}
          model={model}
          aiReachable={aiReachable === true}
          resolved={resolved.has(path)}
          onResolved={() => markResolved(path)}
        />
      ))}

      {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="primary" disabled={!allDone || !!busy} onClick={finish}>
          {busy === 'finish' ? 'Publishing…' : allDone ? 'Finish merge & publish' : `Resolve all ${conflicted.length} first`}
        </button>
        <button className="ghost" disabled={!!busy} onClick={abort}>
          {busy === 'abort' ? 'Canceling…' : 'Cancel merge'}
        </button>
      </div>
    </div>
  );
}

function ConflictFile({
  repo,
  path,
  base,
  model,
  aiReachable,
  resolved,
  onResolved,
}: {
  repo: string;
  path: string;
  base: string;
  model: string;
  aiReachable: boolean;
  resolved: boolean;
  onResolved: () => void;
}) {
  const [versions, setVersions] = useState<ConflictVersions | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const seeded = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gitConflictVersions(repo, path).then(setVersions).catch(() => setVersions(null));
  }, [repo, path]);

  const runChat = useCallback(
    async (history: ChatMessage[]) => {
      setThinking(true);
      setChatError(null);
      try {
        const reply = await ollamaChat(base, model, history);
        setMessages([...history, { role: 'assistant', content: reply }]);
      } catch (e) {
        setChatError(e instanceof Error ? e.message : String(e));
        setMessages(history);
      } finally {
        setThinking(false);
      }
    },
    [base, model],
  );

  // Once versions are loaded and the assistant is reachable, ask it to propose a
  // merge automatically so the editor sees a suggestion without doing anything.
  useEffect(() => {
    if (!versions || versions.binary || resolved || seeded.current || !aiReachable) return;
    seeded.current = true;
    const seed: ChatMessage[] = [
      { role: 'system', content: conflictSystemPrompt(path) },
      {
        role: 'user',
        content:
          `Here are the two versions of this file.\n\n` +
          `=== MY VERSION ===\n${versions.oursExists ? versions.ours : '(deleted)'}\n\n` +
          `=== THEIR VERSION ===\n${versions.theirsExists ? versions.theirs : '(deleted)'}\n\n` +
          (versions.base ? `=== ORIGINAL (before either edit) ===\n${versions.base}\n\n` : '') +
          `Propose one merged version that keeps both people's changes.`,
      },
    ];
    setMessages(seed);
    runChat(seed);
  }, [versions, resolved, aiReachable, path, runChat]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, thinking]);

  async function apply(text: string) {
    setApplyError(null);
    const check = validateResolvedContent(path, text);
    if (!check.ok) {
      setApplyError(check.error);
      return;
    }
    // Normalize to the repo's 2-space JSON so merges don't churn formatting.
    let toWrite = text;
    if (path.toLowerCase().endsWith('.json')) {
      try { toWrite = JSON.stringify(JSON.parse(text), null, 2) + '\n'; } catch { /* keep as-is */ }
    }
    try {
      await gitResolveFile(repo, path, toWrite);
      onResolved();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  }

  async function keepSide(side: 'ours' | 'theirs') {
    setApplyError(null);
    try {
      await gitResolveSide(repo, path, side);
      onResolved();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  }

  const binary = !!versions?.binary;

  function send() {
    const q = input.trim();
    if (!q || thinking) return;
    setInput('');
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    runChat(next);
  }

  // Hide the system + seed messages; show the conversation from the first reply.
  const visible = messages.filter((m) => m.role !== 'system').slice(1);

  return (
    <div className={`card conflict-file ${resolved ? 'is-resolved' : ''}`}>
      <div className="conflict-head">
        <span className="conflict-name">{friendlyName(path)}</span>
        {resolved ? (
          <span className="badge ok-badge">✓ Merged</span>
        ) : binary ? null : (
          <button className="small ghost" onClick={() => setShowVersions((v) => !v)}>
            {showVersions ? 'Hide the two versions' : 'Show the two versions'}
          </button>
        )}
      </div>
      <div className="conflict-path muted">{path}</div>

      {resolved ? (
        <div className="muted" style={{ marginTop: 8 }}>Resolved — ready to publish.</div>
      ) : (
        <>
          {versions && (!versions.oursExists || !versions.theirsExists) && (
            <div className="muted" style={{ marginTop: 8 }}>
              {!versions.oursExists && 'This file was deleted on this computer. '}
              {!versions.theirsExists && 'This file was deleted on the other computer. '}
            </div>
          )}
          {binary && (
            <div className="muted" style={{ marginTop: 8 }}>
              This is an image or other non-text file, so it can’t be shown or merged here — choose which version to keep.
            </div>
          )}

          {showVersions && versions && !binary && (
            <div className="conflict-grid">
              <div className="version-box">
                <div className="version-label">
                  This computer’s version{!versions.oursExists ? ' — deleted on this computer' : ''}
                </div>
                <pre>{versions.oursExists ? tryPretty(versions.ours) : '(deleted)'}</pre>
              </div>
              <div className="version-box">
                <div className="version-label">
                  Other computer’s version{!versions.theirsExists ? ' — deleted on the other computer' : ''}
                </div>
                <pre>{versions.theirsExists ? tryPretty(versions.theirs) : '(deleted)'}</pre>
              </div>
            </div>
          )}

          <div className="row" style={{ margin: '10px 0' }}>
            <button className="small" disabled={!versions} onClick={() => keepSide('ours')}>
              {versions && !versions.oursExists ? 'Keep mine (delete)' : 'Keep mine'}
            </button>
            <button className="small" disabled={!versions} onClick={() => keepSide('theirs')}>
              {versions && !versions.theirsExists ? 'Keep theirs (delete)' : 'Keep theirs'}
            </button>
          </div>

          {binary && applyError && <div className="notice error apply-error">{applyError}</div>}
          {!binary && (
          <div className="chat">
            <div className="chat-log" ref={logRef}>
              {visible.length === 0 && !thinking && (
                <div className="muted chat-hint">
                  {aiReachable
                    ? 'Ask the assistant to combine these, or just use Keep mine / Keep theirs above.'
                    : 'Assistant offline. Use Keep mine / Keep theirs above, or start Ollama to get merge suggestions.'}
                </div>
              )}
              {visible.map((m, i) => {
                const json = m.role === 'assistant' ? extractJson(m.content) : null;
                return (
                  <div key={i} className={`bubble ${m.role}`}>
                    <div className="bubble-text">{m.content}</div>
                    {json && (
                      <button className="small primary apply-btn" onClick={() => apply(json)}>
                        Apply this merged version
                      </button>
                    )}
                  </div>
                );
              })}
              {thinking && <div className="bubble assistant"><em className="muted">Thinking…</em></div>}
            </div>

            {applyError && <div className="notice error apply-error">{applyError}</div>}
            {chatError && <div className="notice error apply-error">{chatError}</div>}

            <div className="chat-input">
              <input
                value={input}
                disabled={!aiReachable}
                placeholder={aiReachable ? 'Ask about this conflict…' : 'Assistant offline'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              />
              <button className="small" disabled={!aiReachable || thinking || !input.trim()} onClick={send}>
                Send
              </button>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
