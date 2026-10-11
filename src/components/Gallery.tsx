import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useImageModal } from './ImageModalProvider';
import { galleryItems, type GalleryItem } from '../data/gallery';
import type { MediaItem } from '../content/schema';
import { MediaLightbox } from './ProjectGallery';
import SectionHeading from './SectionHeading';
import { parseYouTubeId, youTubeThumbUrl } from '../lib/youtube';

const pad = (n: number) => String(n).padStart(2, '0');

const coverClass =
  'w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none';

function TileCover({ item }: { item: MediaItem }) {
  if (item.type === 'video') {
    const ytId = parseYouTubeId(item.src);
    if (ytId) {
      return <img src={youTubeThumbUrl(ytId)} alt="" loading="lazy" decoding="async" className={coverClass} />;
    }
    return <video src={`${item.src}#t=0.1`} preload="metadata" muted playsInline aria-hidden className={coverClass} />;
  }
  return <img src={item.src} alt={item.alt || ''} loading="lazy" decoding="async" className={coverClass} />;
}

function MediaTile({ image, index }: { image: GalleryItem; index: number }) {
  const [open, setOpen] = useState(false);
  const slides: MediaItem[] = [
    ...(image.src ? [{ type: 'image' as const, src: image.src, alt: image.alt }] : []),
    ...(image.media ?? []).filter((m) => m.src && (m.type === 'image' || m.type === 'video')),
  ];
  const cover = slides.find((m) => m.type === 'image') ?? slides.find((m) => m.type === 'video');
  const videos = slides.filter((m) => m.type === 'video').length;
  const label = `Open ${image.title || 'gallery'} gallery, ${slides.length} ${slides.length === 1 ? 'item' : 'items'}`;

  return (
    <>
      <div className="aspect-square bg-neutral-950 overflow-hidden relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="block w-full h-full cursor-pointer focus-visible:[outline-offset:-3px]"
        >
          {cover && <TileCover item={cover} />}
        </button>
        {/* Gallery chip: makes it obvious this tile opens more than one photo. */}
        <div aria-hidden className="absolute z-10 top-3 left-3 flex items-center gap-2 pointer-events-none">
          <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase text-white bg-black/70 backdrop-blur-sm border border-white/15 px-2.5 py-1">
            <svg className="w-3.5 h-3.5 text-signal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <rect x="3" y="7" width="14" height="14" rx="1" />
              <path d="M7 3h13a1 1 0 0 1 1 1v13" />
            </svg>
            Gallery · {String(slides.length).padStart(2, '0')}
          </span>
          {videos > 0 && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.16em] uppercase text-white bg-black/70 backdrop-blur-sm border border-white/15 px-2.5 py-1">
              <span className="text-signal">▶</span>
              {videos === 1 ? 'Video' : `${videos} videos`}
            </span>
          )}
        </div>
        {/* Hover/focus cue */}
        <div
          aria-hidden
          className="absolute z-10 inset-x-0 bottom-0 flex justify-end p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
        >
          <span className="label-mono text-white">Open gallery →</span>
        </div>
      </div>
      {open &&
        createPortal(
          <MediaLightbox
            items={slides}
            startIndex={0}
            title={image.title || `Gallery ${pad(index + 1)}`}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

const Gallery = () => {
  const { openModal } = useImageModal();

  return (
    <section id="gallery" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading
          index="04"
          title="Community Involvement"
          meta={`${pad(galleryItems.length)} missions`}
          className="mb-10"
        />

        <div className="mb-12 max-w-3xl">
          <p className="text-neutral-300 text-legible font-light leading-relaxed text-[15px]">
            As Avionics Lead for Rocket Launchers at UTRGV, I took part in rocketry competitions, design reviews, hackathons and industry visits. These experiences sharpened my technical skills and taught me how to lead and collaborate across a multidisciplinary team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleryItems.map((image, index) => (
            <div
              key={image.id}
              className="hud group glass transition-colors duration-300 hover:border-white/25"
            >
              {image.media?.some((m) => m.src && (m.type === 'image' || m.type === 'video')) ? (
                <MediaTile image={image} index={index} />
              ) : (
                <div className="aspect-square bg-neutral-950 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => openModal(image.src, image.alt)}
                    className="block w-full h-full cursor-pointer focus-visible:[outline-offset:-3px]"
                  >
                    <img
                      src={image.src}
                      alt={image.alt}
                      loading="lazy"
                      decoding="async"
                      className={coverClass}
                    />
                  </button>
                </div>
              )}

              <div className="p-5 border-t border-white/10">
                <div className="label-mono text-neutral-400 mb-2">
                  {pad(index + 1)} / {pad(galleryItems.length)}
                </div>
                <h3 className="font-display text-base font-light text-white mb-1.5 tracking-tight">
                  {image.title}
                </h3>
                <p className="text-neutral-300 text-sm font-light leading-relaxed">
                  {image.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Gallery;
