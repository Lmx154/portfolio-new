import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import HomePage from './components/HomePage';
import BlogPost from './components/BlogPost';
import ParticleBackground from './components/ParticleBackground';
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

function App() {
  return (
    <Router>
      <ImageModalProvider>
        <ScrollToTop />
        <div className="min-h-screen bg-black text-white relative">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog/:id" element={
              <div className="relative">
                <ParticleBackground />
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