import Header from './Header';
import Hero from './Hero';
import Blog from './Blog';
import Projects from './Projects';
import About from './About';
import Gallery from './Gallery';
import { site } from '../data/site';

const footerLink =
  'group inline-flex items-center gap-2 text-neutral-400 hover:text-white focus-visible:text-white transition-colors duration-300 font-light text-sm';
const footerNav = [
  { label: 'About', href: '#about' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Projects', href: '#projects' },
  { label: 'Blog', href: '#blog' },
];

const footerExternal = [
  { label: 'GitHub', href: site.links.github },
  { label: 'LinkedIn', href: site.links.linkedin },
  { label: 'X (Twitter)', href: site.links.twitter },
];

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
      
      <footer className="relative z-10 border-t border-white/10 bg-black/60 backdrop-blur-md pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            <div>
              <h3 className="label-mono text-signal/80 mb-5">01 / Navigate</h3>
              <ul className="space-y-3">
                {footerNav.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className={footerLink}>
                      {item.label}
                      <span aria-hidden="true" className="text-neutral-600 transition-all duration-300 group-hover:text-signal group-hover:translate-x-1 group-focus-visible:text-signal">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="label-mono text-signal/80 mb-5">02 / External</h3>
              <ul className="space-y-3">
                {footerExternal.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} target="_blank" rel="noopener noreferrer" className={footerLink}>
                      {item.label}
                      <span aria-hidden="true" className="text-neutral-600 transition-all duration-300 group-hover:text-signal group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:text-signal">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:text-right">
              <h3 className="label-mono text-signal/80 mb-5">03 / Credits</h3>
              <p className="text-neutral-400 font-light text-sm">{site.footer.copyright}</p>
              <p className="text-neutral-400 text-xs font-light mt-1">{site.footer.rights}</p>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-white/10 flex flex-col-reverse items-center gap-5 sm:flex-row sm:justify-between">
            <span className="hidden sm:block sm:flex-1" aria-hidden="true" />
            <p className="label-mono flex items-center gap-3 text-neutral-400">
              <span aria-hidden="true" className="signal-pulse inline-block w-1.5 h-1.5 bg-signal shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
              End of transmission
            </p>
            <div className="sm:flex-1 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'auto' })}
                className="hud group label-mono inline-flex items-center gap-2 px-4 py-2 border border-white/15 text-neutral-300 hover:text-white hover:border-white/40 transition-colors duration-300"
              >
                Return to orbit
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5">↑</span>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
