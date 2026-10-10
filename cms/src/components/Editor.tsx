import { useEffect, useState } from 'react';
import { BLOG_REL, readPost, savePost, importPublicMedia, postImportDests, type BlogPost } from '../api';
import type { Block } from '@portfolio/content-schema';
import Preview from './Preview';
import { Field, ImageField, ItemToolbar, TagsField, TextArea, TextField } from './fields';

const BLOCK_TYPES: Block['type'][] = ['heading', 'paragraph', 'list', 'image', 'video', 'code', 'quote', 'callout', 'divider'];

function newBlock(type: Block['type']): Block {
  const id = 'blk_' + Math.random().toString(36).slice(2, 9);
  switch (type) {
    case 'heading': return { id, type: 'heading', level: 2, text: '' };
    case 'paragraph': return { id, type: 'paragraph', text: '' };
    case 'image': return { id, type: 'image', src: '' };
    case 'video': return { id, type: 'video', src: '', controls: true, muted: false, autoplay: false, loop: false };
    case 'list': return { id, type: 'list', ordered: false, items: [''] };
    case 'code': return { id, type: 'code', code: '' };
    case 'quote': return { id, type: 'quote', text: '' };
    case 'callout': return { id, type: 'callout', variant: 'info', text: '' };
    case 'divider': return { id, type: 'divider' };
  }
}

function normalize(draft: BlogPost): BlogPost {
  return {
    ...draft,
    tags: draft.tags.map((t) => t.trim()).filter(Boolean),
    blocks: draft.blocks.map((b) => (b.type === 'list' ? { ...b, items: b.items.map((i) => i.trimEnd()).filter(Boolean) } : b)),
  };
}

export default function Editor({ repo, slug, onBack }: { repo: string; slug: string; onBack: () => void }) {
  const [draft, setDraft] = useState<BlogPost | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [addType, setAddType] = useState<Block['type']>('paragraph');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const baseDir = `${BLOG_REL}/${slug}`;

  useEffect(() => {
    let alive = true;
    setDraft(null);
    setLoadError(null);
    readPost(repo, slug)
      .then((p) => alive && setDraft(p))
      .catch((e) => alive && setLoadError(String(e)));
    return () => { alive = false; };
  }, [repo, slug]);

  function patch(p: Partial<BlogPost>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setSaveMsg(null);
  }
  function setBlocks(blocks: Block[]) {
    setDraft((d) => (d ? { ...d, blocks } : d));
    setSaveMsg(null);
  }
  function patchBlock(id: string, changes: Record<string, unknown>) {
    setDraft((d) => (d ? { ...d, blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...changes } as Block) : b)) } : d));
    setSaveMsg(null);
  }
  function moveBlock(id: string, dir: -1 | 1) {
    if (!draft) return;
    const i = draft.blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.blocks.length) return;
    const next = [...draft.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  }
  function duplicateBlock(id: string) {
    if (!draft) return;
    const i = draft.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const clone = { ...draft.blocks[i], id: 'blk_' + Math.random().toString(36).slice(2, 9) } as Block;
    setBlocks([...draft.blocks.slice(0, i + 1), clone, ...draft.blocks.slice(i + 1)]);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await savePost(repo, slug, normalize(draft));
      setDraft(saved);
      setSaveMsg({ kind: 'ok', text: 'Saved ✓' });
    } catch (e) {
      setSaveMsg({ kind: 'error', text: `Could not save:\n${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="small ghost" onClick={onBack}>← Posts</button>
        <h1 style={{ fontWeight: 400 }}>{draft?.title || slug}</h1>
        <div className="spacer" />
        <div className="toggle">
          <button className={mode === 'edit' ? 'small active' : 'small'} onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'preview' ? 'small active' : 'small'} onClick={() => setMode('preview')}>Preview</button>
        </div>
        <button className="primary small" onClick={save} disabled={!draft || saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div className="content">
        <div className="container">
          {loadError && <div className="notice error">{loadError}</div>}
          {!draft && !loadError && <div className="empty">Loading…</div>}

          {draft && saveMsg && <div className={`notice ${saveMsg.kind}`}>{saveMsg.text}</div>}

          {draft && mode === 'preview' && <Preview blocks={draft.blocks} root={repo} baseDir={baseDir} />}

          {draft && mode === 'edit' && (
            <>
              <div className="section-title">Metadata</div>
              <TextField label="Title" value={draft.title} onChange={(v) => patch({ title: v })} />
              <div className="grid2">
                <TextField label="Slug (folder — read only)" value={slug} readOnly mono />
                <Field label="Status">
                  <select value={draft.status} onChange={(e) => patch({ status: e.target.value as BlogPost['status'] })}>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </Field>
                <TextField label="Date (YYYY-MM-DD)" value={draft.date ?? ''} placeholder="2026-06-23" onChange={(v) => patch({ date: v || undefined })} />
                <TextField label="Display date" value={draft.displayDate ?? ''} placeholder="June 23, 2026" onChange={(v) => patch({ displayDate: v || undefined })} />
                <TextField label="Read time" value={draft.readTime ?? ''} placeholder="4 min read" onChange={(v) => patch({ readTime: v })} />
              </div>
              <TextArea label="Excerpt" value={draft.excerpt} onChange={(v) => patch({ excerpt: v })} />
              <TagsField label="Tags (comma-separated)" value={draft.tags} onChange={(v) => patch({ tags: v })} />
              <ImageField
                label="Cover image"
                root={repo}
                value={draft.coverImage ?? ''}
                baseDir={baseDir}
                kind="image"
                onChange={(src) => patch({ coverImage: src || undefined })}
                onImport={() => importPublicMedia(repo, postImportDests(baseDir))}
              />

              <div className="section-title">Content blocks ({draft.blocks.length})</div>
              {draft.blocks.map((block) => (
                <div className="block" key={block.id}>
                  <div className="block-head">
                    <span className="block-type">{block.type}</span>
                    <span className="block-id">{block.id}</span>
                    <ItemToolbar
                      onUp={() => moveBlock(block.id, -1)}
                      onDown={() => moveBlock(block.id, 1)}
                      onDuplicate={() => duplicateBlock(block.id)}
                      onDelete={() => setBlocks(draft.blocks.filter((b) => b.id !== block.id))}
                    />
                  </div>
                  <BlockFields
                    block={block}
                    root={repo}
                    baseDir={baseDir}
                    onImport={() => importPublicMedia(repo, postImportDests(baseDir))}
                    onChange={(c) => patchBlock(block.id, c)}
                  />
                </div>
              ))}

              <div className="add-block">
                <select value={addType} onChange={(e) => setAddType(e.target.value as Block['type'])} style={{ width: 'auto' }}>
                  {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="small" onClick={() => setBlocks([...draft.blocks, newBlock(addType)])}>＋ Add block</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockFields({
  block, root, baseDir, onImport, onChange,
}: {
  block: Block;
  root: string;
  baseDir: string;
  onImport: () => Promise<string | null>;
  onChange: (changes: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="grid2">
          <Field label="Level">
            <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) })}>
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          </Field>
          <TextField label="Text" value={block.text} onChange={(v) => onChange({ text: v })} />
        </div>
      );
    case 'paragraph':
      return <TextArea value={block.text} onChange={(v) => onChange({ text: v })} />;
    case 'quote':
      return <TextArea value={block.text} onChange={(v) => onChange({ text: v })} />;
    case 'callout':
      return (
        <>
          <Field label="Variant">
            <select value={block.variant} onChange={(e) => onChange({ variant: e.target.value })}>
              {['info', 'note', 'success', 'warning'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <TextArea value={block.text} onChange={(v) => onChange({ text: v })} />
        </>
      );
    case 'list':
      return (
        <>
          <div className="checkboxes" style={{ marginBottom: 10 }}>
            <label><input type="checkbox" checked={block.ordered} onChange={(e) => onChange({ ordered: e.target.checked })} /> Ordered (numbered)</label>
          </div>
          <TextArea label="Items (one per line)" value={block.items.join('\n')} onChange={(v) => onChange({ items: v.split('\n') })} />
        </>
      );
    case 'code':
      return (
        <>
          <TextField label="Language" value={block.language ?? ''} placeholder="rust" onChange={(v) => onChange({ language: v || undefined })} />
          <TextArea mono minHeight={120} value={block.code} onChange={(v) => onChange({ code: v })} />
        </>
      );
    case 'image':
      return (
        <>
          <ImageField label="Image" root={root} value={block.src} baseDir={baseDir} kind="media" onChange={(src) => onChange({ src })} onImport={onImport} />
          <div className="grid2">
            <TextField label="Alt" value={block.alt ?? ''} onChange={(v) => onChange({ alt: v || undefined })} />
            <TextField label="Caption" value={block.caption ?? ''} onChange={(v) => onChange({ caption: v || undefined })} />
          </div>
        </>
      );
    case 'video':
      return (
        <>
          <ImageField label="Video" root={root} value={block.src} baseDir={baseDir} kind="media" onChange={(src) => onChange({ src })} onImport={onImport} />
          <TextField label="Caption" value={block.caption ?? ''} onChange={(v) => onChange({ caption: v || undefined })} />
          <div className="checkboxes">
            {(['controls', 'muted', 'autoplay', 'loop'] as const).map((flag) => (
              <label key={flag}>
                <input type="checkbox" checked={block[flag]} onChange={(e) => onChange({ [flag]: e.target.checked })} /> {flag}
              </label>
            ))}
          </div>
        </>
      );
    case 'divider':
      return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Horizontal divider — no fields.</p>;
    default:
      return null;
  }
}
