import { useEffect, useRef, useState } from 'react';
import { cropImage, mediaUrl } from '../api';
import { Icon } from './icons';

/**
 * Crop modal for the image picker. Shows the chosen image with a draggable +
 * corner-resizable selection; on Apply it renders a new cropped WebP (via the
 * ffmpeg backend) next to the source file and returns its path. The selection locks
 * to `aspect` when the field declares one (so the result exactly fills its
 * display box); otherwise it's free-form with ratio presets.
 */

type Rect = { x: number; y: number; w: number; h: number }; // in source (natural) pixels
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Drag = { mode: 'move' | Corner; px: number; py: number; start: Rect } | null;

const PRESETS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: 'Square', ratio: 1 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest rectangle of `ratio` centered in the image (or the whole image if free). */
function centeredRect(nat: { w: number; h: number }, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: nat.w, h: nat.h };
  let w = nat.w;
  let h = w / ratio;
  if (h > nat.h) { h = nat.h; w = h * ratio; }
  return { x: (nat.w - w) / 2, y: (nat.h - h) / 2, w, h };
}

export default function ImageCropper({
  root, src, baseDir, aspect, onDone, onCancel,
}: {
  root: string;
  src: string;
  /** Folder (relative to root) that a relative `src` resolves against, e.g. a blog post. */
  baseDir?: string;
  aspect?: number;
  onDone: (path: string) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<Drag>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [ratio, setRatio] = useState<number | null>(aspect ?? null);
  const [sel, setSel] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = mediaUrl(root, src, baseDir);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function onImgLoad() {
    const el = imgRef.current;
    if (!el) return;
    const n = { w: el.naturalWidth, h: el.naturalHeight };
    setNat(n);
    setSel(centeredRect(n, ratio));
  }

  // Convert a client point to source-pixel coords using the live rendered size.
  const toNatural = (clientX: number, clientY: number) => {
    const r = imgRef.current!.getBoundingClientRect();
    const scale = r.width / (nat?.w || 1);
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  function startDrag(mode: 'move' | Corner, e: React.PointerEvent) {
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toNatural(e.clientX, e.clientY);
    dragRef.current = { mode, px: x, py: y, start: { ...sel } };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !nat) return;
    const { x, y } = toNatural(e.clientX, e.clientY);

    if (d.mode === 'move') {
      setSel({
        x: clamp(d.start.x + (x - d.px), 0, nat.w - d.start.w),
        y: clamp(d.start.y + (y - d.py), 0, nat.h - d.start.h),
        w: d.start.w,
        h: d.start.h,
      });
      return;
    }

    // Resize: the opposite corner is the fixed anchor.
    const anchorX = d.mode === 'nw' || d.mode === 'sw' ? d.start.x + d.start.w : d.start.x;
    const anchorY = d.mode === 'nw' || d.mode === 'ne' ? d.start.y + d.start.h : d.start.y;
    const px = clamp(x, 0, nat.w);
    const py = clamp(y, 0, nat.h);
    let w = Math.abs(px - anchorX);
    let h = Math.abs(py - anchorY);
    if (ratio) {
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
      const maxW = px >= anchorX ? nat.w - anchorX : anchorX;
      const maxH = py >= anchorY ? nat.h - anchorY : anchorY;
      if (w > maxW) { w = maxW; h = w / ratio; }
      if (h > maxH) { h = maxH; w = h * ratio; }
    }
    if (w < 8 || h < 8) return;
    setSel({
      x: px >= anchorX ? anchorX : anchorX - w,
      y: py >= anchorY ? anchorY : anchorY - h,
      w,
      h,
    });
  }

  function endDrag(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function choosePreset(r: number | null) {
    setRatio(r);
    if (nat) setSel(centeredRect(nat, r));
  }

  async function apply() {
    if (!sel || !nat) return;
    setBusy(true);
    setError(null);
    try {
      const { x, y } = sel;
      let { w, h } = sel;
      // Guarantee the exact output ratio (so object-cover doesn't trim it further).
      if (ratio) {
        h = w / ratio;
        if (y + h > nat.h) { h = nat.h - y; w = h * ratio; }
        if (x + w > nat.w) { w = nat.w - x; h = w / ratio; }
      }
      onDone(await cropImage(root, src, { x, y, w, h }, baseDir));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  // Selection drawn as % of the image so it tracks any rendered size.
  const box = sel && nat
    ? { left: `${(sel.x / nat.w) * 100}%`, top: `${(sel.y / nat.h) * 100}%`, width: `${(sel.w / nat.w) * 100}%`, height: `${(sel.h / nat.h) * 100}%` }
    : null;

  return (
    <div className="viewer-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="vm-panel" style={{ maxWidth: 920, height: 'auto', maxHeight: '92vh' }}>
        <div className="vm-top">
          <div className="vm-title"><Icon name="media" size={16} /> Crop image</div>
          <div className="vm-top-actions">
            <button className="small ghost" onClick={onCancel}>Cancel ✕</button>
          </div>
        </div>

        {!aspect && (
          <div className="picker-toolbar" style={{ gap: 8, alignItems: 'center' }}>
            <span className="picker-hint">Aspect</span>
            {PRESETS.map((p) => (
              <button key={p.label} className={`small ${ratio === p.ratio ? '' : 'ghost'}`} onClick={() => choosePreset(p.ratio)}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0e' }}>
          <div
            style={{ position: 'relative', lineHeight: 0, touchAction: 'none' }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          >
            <img
              ref={imgRef}
              src={url}
              alt=""
              onLoad={onImgLoad}
              onError={() => setError('Could not load this image for cropping.')}
              draggable={false}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', userSelect: 'none' }}
            />
            {box && (
              <div
                style={{
                  position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', outline: '1px solid rgba(255,255,255,0.9)', cursor: 'move',
                }}
                onPointerDown={(e) => startDrag('move', e)}
              >
                {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                  <div
                    key={c}
                    onPointerDown={(e) => startDrag(c, e)}
                    style={{
                      position: 'absolute', width: 14, height: 14, background: '#fff', borderRadius: 2,
                      ...(c[0] === 'n' ? { top: -7 } : { bottom: -7 }),
                      ...(c[1] === 'w' ? { left: -7 } : { right: -7 }),
                      cursor: `${c}-resize`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="notice error" style={{ margin: '0 16px' }}>{error}</div>}

        <div className="vm-top" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="picker-hint">
            {sel ? `${Math.round(sel.w)}×${Math.round(sel.h)} px` : ''}
            {aspect ? ' · locked to display shape' : ''}
          </span>
          <div className="vm-top-actions">
            <button className="small ghost" disabled={busy} onClick={() => nat && setSel(centeredRect(nat, ratio))}>Reset</button>
            <button className="primary small" disabled={busy || !sel} onClick={apply}>{busy ? 'Cropping…' : 'Apply crop'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
