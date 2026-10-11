import { importPublicImage, importPublicModel, importPublicVideo } from '../api';
import { Field, ImageField } from './fields';
import type { MediaItem } from '@portfolio/content-schema';

/** Editor for a list of media items (images / videos / 3D models), shared by projects and community tiles. */
export default function MediaListEditor({
  repo,
  media,
  onChange,
  label = 'Media gallery — images / videos / 3D models (takes precedence over the image)',
  types = ['image', 'video', 'model'],
}: {
  repo: string;
  media: MediaItem[];
  onChange: (m: MediaItem[]) => void;
  label?: string;
  types?: MediaItem['type'][];
}) {
  const set = (i: number, patch: Partial<MediaItem>) => onChange(media.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= media.length) return;
    const next = [...media];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const importFor = (type: MediaItem['type']) => () => {
    if (type === 'image') return importPublicImage(repo);
    if (type === 'video') return importPublicVideo(repo);
    return importPublicModel(repo);
  };

  return (
    <Field label={label}>
      <div style={{ display: 'grid', gap: 10 }}>
        {media.map((item, i) => (
          <div key={i} className="tile" style={{ margin: 0, padding: 10 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <select value={item.type} onChange={(e) => set(i, { type: e.target.value as MediaItem['type'] })} style={{ width: 110 }}>
                {(types.includes(item.type) ? types : [item.type, ...types]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="spacer" />
              <button className="small ghost" title="Move up" onClick={() => move(i, -1)}>↑</button>
              <button className="small ghost" title="Move down" onClick={() => move(i, 1)}>↓</button>
              <button className="small danger" title="Remove" onClick={() => onChange(media.filter((_, j) => j !== i))}>✕</button>
            </div>
            <ImageField
              root={repo}
              kind={item.type}
              value={item.src}
              onChange={(src) => set(i, { src })}
              onImport={importFor(item.type)}
            />
            {item.type === 'video' && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Paste a YouTube link or import a video</div>
            )}
            <input value={item.caption ?? ''} placeholder="caption (optional)" style={{ marginTop: 8 }} onChange={(e) => set(i, { caption: e.target.value || undefined })} />
            {item.type === 'image' && (
              <input value={item.alt ?? ''} placeholder="alt text (describe the image for screen readers)" style={{ marginTop: 8 }} onChange={(e) => set(i, { alt: e.target.value || undefined })} />
            )}
          </div>
        ))}
        <button className="small ghost" style={{ justifySelf: 'start' }} onClick={() => onChange([...media, { type: 'image', src: '' }])}>＋ Add media</button>
      </div>
    </Field>
  );
}
