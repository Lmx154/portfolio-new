import { useState, type ReactNode } from 'react';
import { BLOG_REL, mediaUrl } from '../api';
import { parseYouTubeId, youTubeThumbUrl } from '../../../src/lib/youtube';
import { useAssetPicker, type PickFilter } from './AssetPicker';
import ImageCropper from './ImageCropper';
import ModelPreview from './LazyModelPreview';

/** Shared form-field primitives used across every content editor. */

export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function TextField({
  label, value, onChange, placeholder, mono, readOnly,
}: {
  label?: string; value: string; onChange?: (v: string) => void; placeholder?: string; mono?: boolean; readOnly?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        style={mono ? { fontFamily: 'ui-monospace, monospace' } : undefined}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
}

export function TextArea({
  label, value, onChange, placeholder, mono, minHeight,
}: {
  label?: string; value: string; onChange?: (v: string) => void; placeholder?: string; mono?: boolean; minHeight?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        placeholder={placeholder}
        style={{ ...(mono ? { fontFamily: 'ui-monospace, monospace' } : {}), ...(minHeight ? { minHeight } : {}) }}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
}

/** A labeled on/off toggle — clearer than a checkbox for prominent booleans
 *  (homepage visibility, "featured", etc.). Reuses the .switch visual. */
export function Switch({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="switch-field"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className={`switch ${checked ? 'on' : ''}`}><span className="knob" /></span>
      <span className="sf-label">{label}</span>
    </button>
  );
}

export function TagsField({ label, value, onChange }: { label?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label}>
      <input
        value={text}
        placeholder="tag1, tag2"
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean));
        }}
      />
    </Field>
  );
}

/** Editable list of strings with add / remove / reorder. */
export function StringListEditor({
  label, items, onChange, placeholder,
}: {
  label?: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string;
}) {
  const set = (i: number, v: string) => onChange(items.map((it, j) => (j === i ? v : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Field label={label}>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((it, i) => (
          <div className="row" key={i}>
            <input value={it} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
            <button className="small ghost" title="Move up" onClick={() => move(i, -1)}>↑</button>
            <button className="small ghost" title="Move down" onClick={() => move(i, 1)}>↓</button>
            <button className="small danger" title="Remove" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <button className="small ghost" style={{ justifySelf: 'start' }} onClick={() => onChange([...items, ''])}>＋ Add item</button>
      </div>
    </Field>
  );
}

/**
 * Consistent action row for any content item (block / tile / card / trait /
 * paragraph). Standardizes the CRUD affordances so delete always reads the same
 * way: ↑ ↓ everywhere, "Duplicate" where relevant, and a danger "Delete".
 */
export function ItemToolbar({
  onUp, onDown, onDuplicate, onDelete, deleteLabel = 'Delete',
}: {
  onUp?: () => void;
  onDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <div className="item-tools">
      {onUp && <button className="small ghost" title="Move up" onClick={onUp}>↑</button>}
      {onDown && <button className="small ghost" title="Move down" onClick={onDown}>↓</button>}
      {onDuplicate && <button className="small ghost" title="Duplicate" onClick={onDuplicate}>Duplicate</button>}
      {onDelete && <button className="small danger" title={deleteLabel} onClick={onDelete}>{deleteLabel}</button>}
    </div>
  );
}

/** Maps a field's `kind` to what the asset picker should show. */
function pickFilterFor(kind: ImageFieldKind, post?: string): PickFilter {
  switch (kind) {
    case 'file': return { exts: ['pdf'], title: 'Choose a PDF', post };
    case 'model': return { kinds: ['model'], title: 'Choose a 3D model', post };
    case 'video': return { kinds: ['video'], title: 'Choose a video', post };
    case 'media': return { kinds: ['image', 'video'], title: 'Choose an image or video', post };
    default: return { kinds: ['image'], title: 'Choose an image', post };
  }
}

type ImageFieldKind = 'image' | 'video' | 'media' | 'model' | 'file';

/** Slug of the blog post a `baseDir` ("src/content/blog/<slug>") points into. */
function postSlugOf(baseDir?: string): string | undefined {
  const prefix = BLOG_REL + '/';
  return baseDir && baseDir.startsWith(prefix) ? baseDir.slice(prefix.length).split('/')[0] || undefined : undefined;
}

const isExternalRef = (s: string) => /^(?:[a-z]+:)?\/\//i.test(s) || s.startsWith('data:');

/**
 * Asset field with a live preview. "Choose…" browses files already in the repo
 * (a blog post's own assets when `baseDir` is a post folder, otherwise public/);
 * "Import…" (when `onImport` is given) brings in a new file from disk; "Crop…"
 * writes a cropped copy next to the source.
 */
export function ImageField({
  label, root, value, baseDir, onChange, onImport, kind = 'image', aspect,
}: {
  label?: string;
  root: string;
  value: string;
  /** Folder (relative to root) that a relative `value` resolves against, e.g. a blog post. */
  baseDir?: string;
  onChange: (src: string) => void;
  /** Optional: pick a file from disk and return the reference to store. */
  onImport?: () => Promise<string | null>;
  kind?: ImageFieldKind;
  /** Display aspect ratio (w/h) of where this image is shown. When set, the crop
   *  tool locks the selection to it so the result fills its box with no cutoff. */
  aspect?: number;
}) {
  const { pickAsset } = useAssetPicker();
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);
  const ytId = kind === 'video' ? parseYouTubeId(value) : null;
  const url = ytId ? youTubeThumbUrl(ytId) : mediaUrl(root, value, baseDir);
  const isVideo = !ytId && /\.(mp4|webm|ogv|mov)$/i.test(value);
  const isModel = kind === 'model' || /\.(glb|gltf|obj)$/i.test(value);
  const valExt = (value.split('.').pop() || '').toLowerCase();
  const post = postSlugOf(baseDir);
  // Crop only applies to local raster images whose path resolves on disk.
  const canCrop = !!value && !isVideo && !isModel && !isExternalRef(value) && valExt !== 'svg'
    && (value.startsWith('/') || !!baseDir);

  async function choose() {
    const ref = await pickAsset(pickFilterFor(kind, post));
    if (ref) onChange(ref);
  }

  async function doImport() {
    if (!onImport) return;
    setBusy(true);
    try {
      const src = await onImport();
      if (src) onChange(src);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label}>
      <div className="media-field">
        <div className="media-preview">
          {url ? (
            isModel ? <ModelPreview url={url} ext={valExt} className="asset-3d" /> :
            isVideo ? <video src={url} controls muted /> :
            <img src={url} alt="" />
          ) : (
            <div className="media-empty">{isModel ? 'no model' : 'no media'}</div>
          )}
        </div>
        <div className="media-controls">
          <input
            value={value}
            placeholder={kind === 'media' ? 'assets/img.jpg or /img.png' : '/img.png'}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="row">
            <button className="small" onClick={choose}>Choose…</button>
            {onImport && <button className="small ghost" disabled={busy} onClick={doImport}>{busy ? 'Importing…' : 'Import…'}</button>}
            {canCrop && <button className="small ghost" onClick={() => setCropping(true)}>Crop…</button>}
            {value && <button className="small ghost" onClick={() => onChange('')}>Clear</button>}
          </div>
        </div>
      </div>
      {cropping && (
        <ImageCropper
          root={root}
          src={value}
          baseDir={baseDir}
          aspect={aspect}
          onCancel={() => setCropping(false)}
          onDone={(path) => { onChange(path); setCropping(false); }}
        />
      )}
    </Field>
  );
}
