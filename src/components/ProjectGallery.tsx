import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MediaItem } from '../content/schema';
import LazyModel from './LazyModel';
import { parseYouTubeId, youTubeEmbedUrl, youTubeThumbUrl } from '../lib/youtube';

/* ------------------------------------------------------------- media view */

function TileVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => {});
      else el.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  return <video ref={ref} src={src} muted loop playsInline preload="metadata" className="w-full h-full object-cover" />;
}

function MediaView({ item, mode }: { item: MediaItem; mode: 'tile' | 'full' }) {
  if (item.type === 'model') {
    // Tile: spinning, non-interactive preview (clicks open the lightbox).
    // Full: interactive orbit/zoom.
    return <LazyModel src={item.src} interactive={mode === 'full'} autoRotate gate={mode === 'tile'} />;
  }
  if (item.type === 'video') {
    const ytId = parseYouTubeId(item.src);
    if (ytId) {
      return mode === 'full' ? (
        <iframe
          src={youTubeEmbedUrl(ytId)}
          title={item.caption || item.alt || 'YouTube video'}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="border-0 bg-black"
          style={{ aspectRatio: '16 / 9', width: 'min(100%, calc(80vh * 16 / 9))' }}
        />
      ) : (
        <img src={youTubeThumbUrl(ytId)} alt={item.alt || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      );
    }
    return mode === 'full' ? (
      <video src={item.src} controls autoPlay playsInline className="max-w-full max-h-full" />
    ) : (
      <TileVideo src={item.src} />
    );
  }
  return mode === 'full' ? (
    <img src={item.src} alt={item.alt || ''} className="max-w-full max-h-full object-contain" />
  ) : (
    <img src={item.src} alt={item.alt || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" />
  );
}

/* ----------------------------------------------------------------- arrows */

function Arrow({ dir, onClick, big }: { dir: 'left' | 'right'; onClick: () => void; big?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
      className={`absolute top-1/2 -translate-y-1/2 z-20 ${dir === 'left' ? 'left-2' : 'right-2'} ${
        big ? 'p-3' : 'p-1.5'
      } bg-black/50 hover:bg-black/80 border border-white/10 hover:border-signal/40 text-white/80 hover:text-signal transition-colors`}
    >
      <svg className={big ? 'w-6 h-6' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={dir === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}

/* -------------------------------------------------------------- lightbox */

export function MediaLightbox({
  items,
  startIndex,
  title,
  onClose,
  onIndexChange,
}: {
  items: MediaItem[];
  startIndex: number;
  title: string;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
}) {
  const [i, setI] = useState(startIndex);
  const many = items.length > 1;
  const go = (delta: number) => setI((p) => (p + delta + items.length) % items.length);
  const item = items[i];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onIndexChange?.(i);
  }, [i, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm grid place-items-center p-4 sm:p-10 outline-none"
      onClick={onClose}
    >
      <div className="absolute top-5 left-6 font-mono text-white/40 text-[11px] tracking-[0.18em] uppercase pointer-events-none">{title}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute top-4 right-4 z-30 p-2 text-white/70 hover:text-white bg-black/40 border border-white/10 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative w-[88vw] h-[80vh] max-w-6xl flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <MediaView key={i} item={item} mode="full" />
      </div>

      {many && <Arrow dir="left" big onClick={() => go(-1)} />}
      {many && <Arrow dir="right" big onClick={() => go(1)} />}

      {item.caption && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm font-light bg-black/60 px-4 py-2 border border-white/10 max-w-2xl text-center pointer-events-none">
          {item.caption}
        </div>
      )}
      {many && (
        <div className="absolute bottom-6 right-6 font-mono text-white/50 text-[11px] tracking-[0.15em] pointer-events-none">
          {i + 1} / {items.length}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ in-tile gallery */

export default function ProjectGallery({ items, title }: { items: MediaItem[]; title: string }) {
  const media = items.filter((m) => m.src);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  if (!media.length) return <div className="w-full h-full bg-neutral-950" />;

  const clamped = Math.min(index, media.length - 1);
  const many = media.length > 1;
  const go = (delta: number) => setIndex(() => (clamped + delta + media.length) % media.length);

  return (
    <>
      <div className="relative w-full h-full">
        <MediaView item={media[clamped]} mode="tile" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title} media`}
          className="absolute inset-0 z-10 cursor-zoom-in focus-visible:[outline-offset:-3px]"
        />

        {many && <Arrow dir="left" onClick={() => go(-1)} />}
        {many && <Arrow dir="right" onClick={() => go(1)} />}
        {many && (
          <div className="absolute z-10 bottom-2 left-2 font-mono text-[10px] tracking-[0.15em] text-white/70 bg-black/50 px-2 py-0.5 border border-white/10 pointer-events-none">
            {clamped + 1} / {media.length}
          </div>
        )}
        <div className="absolute z-10 top-2 right-2 p-1.5 bg-black/40 border border-white/10 text-white/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
          </svg>
        </div>
      </div>

      {open &&
        createPortal(
          <MediaLightbox
            items={media}
            startIndex={clamped}
            title={title}
            onClose={() => setOpen(false)}
            onIndexChange={setIndex}
          />,
          document.body,
        )}
    </>
  );
}
