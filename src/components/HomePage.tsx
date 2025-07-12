import ParticleBackground from './ParticleBackground';
import Header from './Header';
import Hero from './Hero';
import Blog from './Blog';
import Projects from './Projects';
import About from './About';

const HomePage = () => {
  return (
    <div className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <Header />
      <main className="relative z-10">
        <Hero />
        <Blog />
        <Projects />
        <About />
      </main>
      
      <footer className="bg-gray-900 border-t border-gray-800 py-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Links */}
            <div>
              <h3 className="text-white font-light mb-4 tracking-wide">LINKS</h3>
              <div className="space-y-2">
                <a href="#about" className="block text-gray-400 hover:text-white transition-colors font-light">
                  About
                </a>
                <a href="#projects" className="block text-gray-400 hover:text-white transition-colors font-light">
                  Projects
                </a>
                <a href="#blog" className="block text-gray-400 hover:text-white transition-colors font-light">
                  Blog
                </a>
              </div>
            </div>

            {/* External Links */}
            <div>
              <h3 className="text-white font-light mb-4 tracking-wide">EXTERNAL</h3>
              <div className="space-y-2">
                <a 
                  href="https://github.com/Lmx154" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors font-light flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>GitHub</span>
                </a>
                <a 
                  href="https://linkedin.com/in/luis-martinez" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors font-light flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>

            {/* Copyright */}
            <div className="md:text-right">
              <p className="text-gray-400 font-light">
                © 2025 Luis Martinez
              </p>
              <p className="text-gray-500 text-sm font-light mt-1">
                All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;