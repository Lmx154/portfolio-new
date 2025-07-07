import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import BlogPost from './components/BlogPost';
import ParticleBackground from './components/ParticleBackground';
import Header from './components/Header';

function App() {
  return (
    <Router>
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
    </Router>
  );
}

export default App;