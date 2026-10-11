import { importPublicImage, projectsApi, type Project } from '../api';
import { Field, ImageField, TagsField, TextArea, TextField } from './fields';
import CollectionEditor from './CollectionEditor';
import MediaListEditor from './MediaListEditor';

const STATUSES = ['Completed', 'In Progress', 'Planned'];

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
          <MediaListEditor repo={repo} media={p.media} onChange={(media) => update({ media })} />
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
