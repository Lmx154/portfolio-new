import { useEffect, useState } from 'react';
import type { MediaAsset } from '../api';
import ModelPreview from './LazyModelPreview';
import { Icon } from './icons';

/**
 * Full-screen 3D viewer with a 3dviewer.net-style component panel: the model's
 * named parts (OBJ groups / glTF nodes) are listed with an eye toggle so you can
 * hide/show pieces. Big stage so the render has room to breathe.
 */
export default function ModelViewerModal({
  asset,
  busy,
  onConvert,
  onClose,
}: {
  asset: MediaAsset;
  busy?: boolean;
  onConvert?: () => void;
  onClose: () => void;
}) {
  const [components, setComponents] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const visibleCount = components.length - hidden.size;

  return (
    <div className="viewer-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vm-panel">
        <div className="vm-top">
          <div className="vm-title">
            <Icon name="cube" size={16} /> {asset.name}
            <span className="vm-ext">{asset.ext.toUpperCase()}{asset.area === 'models' ? ' · source' : ''}</span>
          </div>
          <div className="vm-top-actions">
            {onConvert && (
              <button className="small" disabled={busy} onClick={onConvert} title="Make an optimized GLB for the website">
                Convert for web
              </button>
            )}
            <button className="small ghost" onClick={onClose}>Close ✕</button>
          </div>
        </div>

        <div className="vm-body">
          <div className="vm-stage">
            <ModelPreview url={asset.url} ext={asset.ext} onComponents={setComponents} hidden={hidden} />
          </div>

          <div className="vm-side">
            <div className="vm-side-head">
              <span>Parts {components.length ? `(${visibleCount}/${components.length})` : ''}</span>
              {components.length > 1 && (
                <span className="vm-side-btns">
                  <button className="small ghost" onClick={() => setHidden(new Set())}>Show all</button>
                  <button className="small ghost" onClick={() => setHidden(new Set(components))}>Hide all</button>
                </span>
              )}
            </div>
            <div className="vm-comp-list">
              {components.length === 0 ? (
                <div className="vm-comp-empty">Loading parts…</div>
              ) : (
                components.map((name) => {
                  const isHidden = hidden.has(name);
                  return (
                    <button
                      key={name}
                      className={`vm-comp ${isHidden ? 'off' : ''}`}
                      onClick={() => toggle(name)}
                      title={isHidden ? 'Show' : 'Hide'}
                    >
                      <span className="vm-comp-eye"><Icon name={isHidden ? 'eyeoff' : 'eye'} size={15} /></span>
                      <span className="vm-comp-name">{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
