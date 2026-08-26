import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import HomePage from './components/HomePage';
import BlogPost from './components/BlogPost';
import SpaceBackground from './components/SpaceBackgroundLazy';
import Header from './components/Header';
import { ImageModalProvider } from './components/ImageModalProvider';
import { isSpacelab } from './space/isSpacelab';

// Component to handle scroll restoration
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

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
function SpacelabPage() {
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

function App() {
  if (isSpacelab()) return <SpacelabPage />;

  return (
    <Router>
      <ImageModalProvider>
        <ScrollToTop />
        <div className="min-h-screen bg-black text-white relative">
          <PersistentBackground />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog/:id" element={
              <div className="relative">
                <div className="relative z-10">
                  <Header />
                  <BlogPost />
                </div>
              </div>
            } />
          </Routes>
        </div>
      </ImageModalProvider>
    </Router>
  );
}

export default App;
