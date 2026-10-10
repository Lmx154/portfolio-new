import { importPublicImage, importPublicModel, importPublicVideo, projectsApi, type Project } from '../api';
import { Field, ImageField, TagsField, TextArea, TextField } from './fields';
import CollectionEditor from './CollectionEditor';
import type { MediaItem } from '@portfolio/content-schema';

const STATUSES = ['Completed', 'In Progress', 'Planned'];

/** Editor for a project's media gallery (images / videos / 3D models). */
function ProjectMediaEditor({ repo, media, onChange }: { repo: string; media: MediaItem[]; onChange: (m: MediaItem[]) => void }) {
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
    <Field label="Media gallery — images / videos / 3D models (takes precedence over the image)">
      <div style={{ display: 'grid', gap: 10 }}>
        {media.map((item, i) => (
          <div key={i} className="tile" style={{ margin: 0, padding: 10 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <select value={item.type} onChange={(e) => set(i, { type: e.target.value as MediaItem['type'] })} style={{ width: 110 }}>
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="model">model</option>
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

export default function ProjectsEditor({ repo }: { repo: string }) {
  return (
    <CollectionEditor<Project>
      repo={repo}
      title="Projects"
      hint="Project cards shown on the homepage, in the order listed here."
      guide={{
        intro: 'Each project is one card on your homepage. Edit the details here, order the cards with the arrows, then Save.',
        steps: [
          'Click ＋ New, type a title, and Create. The id (file name) is made from the title and cannot be changed later.',
          'Expand a card to edit its title, status, image, description, tags, and links. Use Choose… to pick an image already in the site, or Import… to bring one in from disk.',
          'Add entries to the media gallery to show several images, videos, or 3D models on the project. When it has any, it replaces the single image.',
          'Use ↑ / ↓ to change the order cards appear in. Reordering pauses while a search filter is active.',
          'Press Save to write every project (and the new order) to the site content.',
        ],
      }}
      api={projectsApi}
      newTitleLabel="Title"
      newButtonLabel="＋ New project"
      emptyText="No projects yet."
      reorderable
      displayName={(p) => p.title}
      makeSeed={(id, title, items) => ({
        type: 'project',
        id,
        title,
        status: 'Completed',
        order: items.length ? Math.max(...items.map((p) => p.order)) + 10 : 10,
        image: '',
        description: '',
        tags: [],
      })}
      renderItem={(p, update) => (
        <>
          <TextField label="Title" value={p.title} onChange={(v) => update({ title: v })} />
          <Field label="Status">
            <select value={p.status} onChange={(e) => update({ status: e.target.value })}>
              {(STATUSES.includes(p.status) ? STATUSES : [p.status, ...STATUSES]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <ImageField label="Image" root={repo} value={p.image} onChange={(src) => update({ image: src })} onImport={() => importPublicImage(repo)} />
          <ProjectMediaEditor repo={repo} media={p.media} onChange={(media) => update({ media })} />
          <TextArea label="Description" value={p.description} onChange={(v) => update({ description: v })} />
          <TagsField label="Tags" value={p.tags} onChange={(v) => update({ tags: v })} />
          <div className="grid2">
            <TextField label="GitHub URL" value={p.github ?? ''} placeholder="https://github.com/…" onChange={(v) => update({ github: v || null })} />
            <TextField label="Live demo URL" value={p.deploymentUrl ?? ''} placeholder="https://…" onChange={(v) => update({ deploymentUrl: v || null })} />
          </div>
        </>
      )}
    />
  );
}
