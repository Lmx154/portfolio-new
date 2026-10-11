import { useEffect, useState, type CSSProperties } from 'react';
import { site } from '../data/site';
import LocalClock from './LocalClock';

const corner = 'absolute w-5 h-5 border-white/20';

const Hero = () => {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // Stagger fade-up on first load. Reduced motion collapses the duration
  // globally; the per-line delay is cleared here so nothing waits.
  const rise = `transition-[opacity,transform] duration-[400ms] ease-out [transition-delay:var(--d)] motion-reduce:[transition-delay:0ms] ${
    entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
  }`;
  const delay = (step: number) => ({ '--d': `${step * 30}ms` }) as CSSProperties;

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center pt-20 pb-24">
      {/* Instrument frame */}
      <div aria-hidden="true" className="hidden md:block absolute inset-x-8 top-20 bottom-8 pointer-events-none">
        <span className={`${corner} top-0 left-0 border-t border-l`} />
        <span className={`${corner} top-0 right-0 border-t border-r`} />
        <span className={`${corner} bottom-0 left-0 border-b border-l`} />
        <span className={`${corner} bottom-0 right-0 border-b border-r`} />
      </div>

      <div className="max-w-6xl mx-auto px-6 w-full">
        <div className="flex flex-col items-center text-center">
          <p
            className={`font-mono text-xs md:text-sm tracking-[0.3em] text-neutral-300 uppercase mb-6 text-legible ${rise}`}
            style={delay(0)}
          >
            <span aria-hidden="true" className="text-signal/70">{'// '}</span>
            {site.name}
          </p>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-light text-white text-legible leading-[0.95] tracking-tight mb-12">
            {site.headlines.map((headline, index) => (
              <span key={index} className={`block ${rise}`} style={delay(index + 1)}>
                {headline}
              </span>
            ))}
          </h1>

          <div
            className={`flex flex-wrap items-center justify-center gap-4 ${rise}`}
            style={delay(site.headlines.length + 1)}
          >
            {site.ctas.map((cta, index) => (
              <button
                key={index}
                onClick={() => document.getElementById(cta.target)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
                className={
                  index === 0
                    ? 'bg-white text-black px-8 py-3.5 text-[13px] tracking-[0.12em] font-medium hover:bg-neutral-200 hover:shadow-[0_0_22px_rgba(255,255,255,0.28)] transition-all duration-300 ease-out'
                    : 'hud border border-white/20 text-white px-8 py-3.5 text-[13px] tracking-[0.12em] font-light hover:border-white/50 hover:bg-white/5 transition-all duration-300 ease-out'
                }
              >
                {cta.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Readout strip */}
      <div
        aria-hidden="true"
        className={`absolute bottom-6 md:bottom-12 inset-x-6 md:inset-x-14 flex items-end justify-between font-mono text-[10px] sm:text-[11px] tracking-[0.14em] sm:tracking-[0.18em] uppercase text-neutral-500 pointer-events-none ${rise}`}
        style={delay(site.headlines.length + 3)}
      >
        <span className="flex items-center gap-3">
          <span className="flex flex-col -space-y-1.5 text-signal/80">
            <Chevron className="signal-pulse" />
            <Chevron className="signal-pulse [animation-delay:0.4s]" />
          </span>
          Scroll to descend
        </span>
        <LocalClock />
      </div>
    </section>
  );
};

const Chevron = ({ className = '' }: { className?: string }) => (
  <svg className={`w-3 h-3 ${className}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M2 4l4 4 4-4" />
  </svg>
);

export default Hero;
