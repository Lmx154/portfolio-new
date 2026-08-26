import Header from './Header';
import Hero from './Hero';
import Blog from './Blog';
import Projects from './Projects';
import About from './About';
import Gallery from './Gallery';
import { site } from '../data/site';

const HomePage = () => {
  return (
    <div className="min-h-screen text-white relative">
      <Header />
      <main className="relative z-10">
        <Hero />
        <Blog />
        <Projects />
        <About />
        <Gallery />
      </main>
      
      <footer className="border-t border-white/10 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Links */}
            <div>
              <h3 className="text-white text-xs uppercase tracking-[0.18em] font-light mb-4">LINKS</h3>
              <div className="space-y-2">
                <a href="#about" className="block text-neutral-400 hover:text-white transition-colors font-light text-sm">
                  About
                </a>
                <a href="#gallery" className="block text-neutral-400 hover:text-white transition-colors font-light text-sm">
                  Gallery
                </a>
                <a href="#projects" className="block text-neutral-400 hover:text-white transition-colors font-light text-sm">
                  Projects
                </a>
                <a href="#blog" className="block text-neutral-400 hover:text-white transition-colors font-light text-sm">
                  Blog
                </a>
              </div>
            </div>

            {/* External Links */}
            <div>
              <h3 className="text-white text-xs uppercase tracking-[0.18em] font-light mb-4">EXTERNAL</h3>
              <div className="space-y-2">
                <a 
                  href={site.links.github} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-white transition-colors font-light text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>GitHub</span>
                </a>
                <a 
                  href={site.links.linkedin} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-white transition-colors font-light text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
                <a 
                  href={site.links.twitter} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-white transition-colors font-light text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>X (Twitter)</span>
                </a>
              </div>
            </div>

            {/* Copyright */}
            <div className="md:text-right">
              <p className="text-neutral-400 font-light text-sm">
                {site.footer.copyright}
              </p>
              <p className="text-neutral-600 text-xs font-light mt-1">
                {site.footer.rights}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
