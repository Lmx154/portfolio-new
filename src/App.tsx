import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import HomePage from './components/HomePage';
import BlogPost from './components/BlogPost';
import SpaceBackground from './components/SpaceBackgroundLazy';
import Header from './components/Header';
import { ImageModalProvider } from './components/ImageModalProvider';

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

function App() {
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
