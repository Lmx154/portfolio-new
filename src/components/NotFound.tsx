import { Link } from 'react-router-dom';
import Header from './Header';

const NotFound = () => {
  return (
    <div className="relative">
      <div className="relative z-10">
        <Header />
        <div className="min-h-screen text-white flex items-center justify-center pt-20 px-6">
          <div className="glass hud relative w-full max-w-xl px-8 py-12 sm:px-12 sm:py-14 text-center">
            <p className="label-mono flex items-center justify-center gap-3 text-signal/90 mb-6">
              <span aria-hidden="true" className="signal-pulse inline-block w-1.5 h-1.5 bg-signal shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
              ERR 404 · Signal lost
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight text-white text-legible mb-4">
              Page not found
            </h1>
            <p className="text-neutral-400 font-light text-sm sm:text-base mb-10">
              Nothing is transmitting at this address. The page may have moved, or never existed.
            </p>
            <Link
              to="/"
              className="group inline-flex items-center gap-2 border border-white/20 px-7 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-white hover:border-white/50 hover:bg-white/5 transition-all duration-300"
            >
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-x-0.5">←</span>
              Return to base
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
