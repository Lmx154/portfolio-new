import { Suspense, lazy, type ComponentProps } from 'react';

// three.js is ~560 KB — load it (and the viewer) only when a 3D model is
// actually shown, so opening the CMS stays instant for everyone else.
const ModelPreview = lazy(() => import('./ModelPreview'));

export default function LazyModelPreview(props: ComponentProps<typeof ModelPreview>) {
  return (
    <Suspense fallback={<div className="model-preview"><div className="mp-status">Loading 3D…</div></div>}>
      <ModelPreview {...props} />
    </Suspense>
  );
}
