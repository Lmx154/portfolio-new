import { lazy, Suspense, useEffect, useState } from 'react';

// Code-split the Three.js starfield out of the initial bundle. The hero text
// paints immediately on a black background; the nebula fades in once its chunk
// (Three.js + this component) has loaded.
const SpaceBackground = lazy(() => import('./SpaceBackground'));

const backdrop = <div className="fixed inset-0 z-0 bg-black" />;

// Client-only island: the server and the hydrating render both emit the same
// black backdrop; the WebGL starfield is only requested after mount.
const SpaceBackgroundLazy = (props: { warpSignal?: number }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return backdrop;

  return (
    <Suspense fallback={backdrop}>
      <SpaceBackground {...props} />
    </Suspense>
  );
};

export default SpaceBackgroundLazy;
