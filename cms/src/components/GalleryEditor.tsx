import { galleryItemsApi, importPublicImage } from '../api';
import type { GalleryItem } from '@portfolio/content-schema';
import { ImageField, TextArea, TextField } from './fields';
import CollectionEditor from './CollectionEditor';

export default function GalleryEditor({ repo }: { repo: string }) {
  return (
    <CollectionEditor<GalleryItem>
      repo={repo}
      title="Community Involvement"
      hint="Community Involvement tiles shown on the homepage, in the order listed here."
      guide={{
        intro: 'Each tile is a photo with a title and short description on the homepage Community Involvement section. Edit the tiles, order them with the arrows, then Save.',
        steps: [
          'Click ＋ New tile, give it a title, and Create. An id is generated for you.',
          'Expand a tile to set its image (Choose… from the site, or Import… from disk), title, alt text, and description.',
          'Alt text describes the photo for screen readers and search engines. Keep it short and factual.',
          'Use ↑ / ↓ to change the order tiles appear in. Reordering pauses while you search.',
          'Press Save to write the tiles and their order to the site content.',
        ],
      }}
      api={galleryItemsApi}
      newTitleLabel="Title"
      newButtonLabel="＋ New tile"
      emptyText="No tiles yet. Add one."
      reorderable
      autoId={() => crypto.randomUUID()}
      displayName={(g) => g.title}
      makeSeed={(id, title) => ({ id, src: '', alt: '', title, description: '' })}
      renderItem={(item, update) => (
        <>
          <ImageField label="Image" root={repo} value={item.src} onChange={(src) => update({ src })} onImport={() => importPublicImage(repo)} />
          <div className="grid2">
            <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} />
            <TextField label="Alt text" value={item.alt} onChange={(v) => update({ alt: v })} />
          </div>
          <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
        </>
      )}
    />
  );
}
