import { lazy, Suspense } from 'react';

// Code-split the Three.js starfield out of the initial bundle. The hero text
// paints immediately on a black background; the nebula fades in once its chunk
// (Three.js + this component) has loaded.
const SpaceBackground = lazy(() => import('./SpaceBackground'));

const SpaceBackgroundLazy = (props: { warpSignal?: number }) => (
  <Suspense fallback={<div className="fixed inset-0 z-0 bg-black" />}>
    <SpaceBackground {...props} />
  </Suspense>
);

export default SpaceBackgroundLazy;
