import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { site } from '../data/site';
import ScrollProgress from './ScrollProgress';

const SECTION_IDS = ['hero', 'blog', 'projects', 'about', 'gallery'] as const;

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';
  const isBlogPost = location.pathname.startsWith('/blog/');

  // Starts false on the server and the hydrating render; the effect below syncs it.
  const [scrolled, setScrolled] = useState(false);
  const [spySection, setSpySection] = useState<string | null>('hero');

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Scroll-spy: the section crossing a thin band near the viewport's upper-middle is "current".
  useEffect(() => {
    if (!isHomePage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) setSpySection(id);
          else setSpySection((current) => (current === id ? null : current));
        }
      },
      { rootMargin: '-40% 0px -59% 0px', threshold: 0 },
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [isHomePage]);

  const activeSection = isBlogPost ? 'blog' : isHomePage ? spySection : null;

  const scrollToSection = (sectionId: string) => {
    if (!isHomePage) {
      navigate(`/#${sectionId}`);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'auto' });
  };

  const scrollToTop = () => {
    if (!isHomePage) {
      navigate('/');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const navItems: { label: string; section: string; onClick: () => void }[] = [
    { label: 'HOME', section: 'hero', onClick: scrollToTop },
    { label: 'BLOG', section: 'blog', onClick: () => scrollToSection('blog') },
    { label: 'PROJECTS', section: 'projects', onClick: () => scrollToSection('projects') },
    { label: 'ABOUT', section: 'about', onClick: () => scrollToSection('about') },
  ];

  const iconClass =
    'text-neutral-500 hover:text-white hover:scale-110 hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.5)] transition-all duration-300 ease-out';

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Frosted plate, faded in once the page scrolls so the top stays clear. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black border-b border-white/10 transition-opacity duration-300 ease-out ${
          scrolled ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <ScrollProgress />
      <div className="relative max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <nav aria-label="Primary" className="flex space-x-4 sm:space-x-7">
            {navItems.map((item) => {
              const active = item.section === activeSection;
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  aria-current={active ? (isBlogPost ? 'page' : 'true') : undefined}
                  className={`relative inline-block py-1 font-mono text-[11px] sm:text-[12px] tracking-[0.12em] sm:tracking-[0.2em] transition-colors duration-300 ease-out hover:text-white hover:[text-shadow:0_0_10px_rgba(255,255,255,0.45)] ${
                    active ? 'text-white' : 'text-neutral-400'
                  }`}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 -bottom-0.5 h-px bg-signal origin-left transition-transform duration-300 ease-out ${
                      active ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          <div className="hidden sm:flex items-center space-x-5">
            {site.links.github && (
              <a href={site.links.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className={iconClass}>
                <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            )}
            {site.links.linkedin && (
              <a href={site.links.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className={iconClass}>
                <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            )}
            {site.links.twitter && (
              <a href={site.links.twitter} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className={iconClass}>
                <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
            {site.links.email && (
              <a href={`mailto:${site.links.email}`} aria-label="Email" className={iconClass}>
                <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
