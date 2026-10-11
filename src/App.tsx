import { Routes, Route, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import HomePage from './components/HomePage';
import SpaceBackground from './components/SpaceBackgroundLazy';
import Header from './components/Header';
import NotFound from './components/NotFound';
import { ImageModalProvider } from './components/ImageModalProvider';

const BlogPost = lazy(() => import('./components/BlogPost'));

// Component to handle scroll restoration
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const lastLocation = useRef<string | null>(null);

  useEffect(() => {
    const key = pathname + hash;
    // Same location again only happens when StrictMode replays the mount effect.
    if (lastLocation.current === key) return;
    const firstMount = lastLocation.current === null;
    lastLocation.current = key;
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'auto' });
        return;
      }
    }
    // Never reset on first mount: a reader may have scrolled the prerendered
    // page before JS loaded, and hydration must not move them.
    if (firstMount) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}

/**
 * Keep one continuous starfield above the router so navigating between the
 * portfolio and a blog post does not rebuild the Three.js scene. Route changes
 * briefly trigger the upgraded background's warp effect.
 */
function PersistentBackground() {
  const { pathname } = useLocation();
  const [warpSignal, setWarpSignal] = useState(0);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setWarpSignal((signal) => signal + 1);
  }, [pathname]);

  return <SpaceBackground warpSignal={warpSignal} />;
}

/**
 * `?spacelab` (Task 12) is a standalone dev harness, not a page in the site.
 * It must mount with NO portfolio DOM present at all — no Router, no
 * HomePage, no Header, no ImageModalProvider — because it needs the full,
 * ordinary document flow to itself: a plain container that grows to the
 * grid's height and lets the page scroll normally. Mounting it underneath
 * the site's own fixed background layer (as SpaceBackground) put the
 * homepage on top of the grid and decoupled page scroll from it entirely.
 */
export function SpacelabPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Dynamic import: `./space/spacelab` statically imports `three`, and this
    // effect only ever runs once `isSpacelab()` (which lives in the
    // three-free `./space/isSpacelab` and does NOT import three) has already
    // gated the route. Reaching `three` through this boundary instead of a
    // static top-of-file import keeps it out of every ordinary page load's
    // bundle.
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import('./space/spacelab').then(({ mountSpacelab }) => {
      if (cancelled) return;
      cleanup = mountSpacelab(el);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={ref} className="min-h-screen bg-black text-white" />;
}

/**
 * Routed pages, each fading in on navigation. The wrapper is keyed by pathname
 * so React remounts it per route, replaying the opacity animation. Opacity only
 * (no transform) so the fixed header is unaffected; the persistent starfield
 * lives outside this subtree.
 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-in">
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/blog/:id" element={
          <div className="relative">
            <div className="relative z-10">
              <Header />
              <Suspense fallback={null}>
                <BlogPost />
              </Suspense>
            </div>
          </div>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

/**
 * The site tree shared by the browser and the build-time prerender. It is
 * router-agnostic: the client entry wraps it in BrowserRouter, the server entry
 * in StaticRouter. Nothing here may read browser globals, the clock or
 * randomness during render (ADR-001).
 */
export function Site() {
  return (
    <ImageModalProvider>
      <ScrollToTop />
      <div className="min-h-screen bg-black text-white relative">
        <PersistentBackground />
        <AnimatedRoutes />
      </div>
    </ImageModalProvider>
  );
}
