import type { ReactNode } from 'react';
import ClickableImage from './ClickableImage';
import SectionHeading from './SectionHeading';
import { about } from '../data/about';
import { site } from '../data/site';

// Icon registry: content stores an icon *name*; the SVG markup (design) lives
// here. Names must match TRAIT_ICON_NAMES in the shared schema.
const TRAIT_ICONS: Record<string, ReactNode> = {
  code: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />,
  book: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />,
  puzzle: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />,
  bolt: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />,
  cpu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />,
  lightbulb: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />,
  users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
  rocket: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />,
  star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />,
};

function TraitIcon({ name }: { name: string }) {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {TRAIT_ICONS[name] ?? TRAIT_ICONS.code}
    </svg>
  );
}

const About = () => {
  return (
    <section id="about" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading index="03" title={about.sectionTitle} className="mb-12" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left: photo + personality traits */}
          <div className="lg:col-span-4">
            <div className="max-w-[300px] mx-auto lg:mx-0">
              <figure className="relative group m-1.5">
                {/* Instrument frame: corner ticks */}
                <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 -left-1.5 w-3 h-3 border-t border-l border-white/50 transition-colors group-hover:border-signal" />
                <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 -right-1.5 w-3 h-3 border-t border-r border-white/50 transition-colors group-hover:border-signal" />
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-1.5 -left-1.5 w-3 h-3 border-b border-l border-white/50 transition-colors group-hover:border-signal" />
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-1.5 -right-1.5 w-3 h-3 border-b border-r border-white/50 transition-colors group-hover:border-signal" />
                <div className="w-full aspect-[4/5] bg-neutral-950 border border-white/10 overflow-hidden">
                  <ClickableImage
                    src={about.profileImage}
                    alt={about.profileAlt}
                    className="w-full h-full object-cover"
                  />
                </div>
                {(about.profileAlt || site.role) && (
                  <figcaption className="glass border-t-0 px-3 py-2 label-mono flex flex-col gap-0.5">
                    {about.profileAlt && <span className="text-white">{about.profileAlt}</span>}
                    {site.role && <span>{site.role}</span>}
                  </figcaption>
                )}
              </figure>

              <div className="mt-8 space-y-3">
                {about.traits.map((trait, index) => (
                  <div
                    key={index}
                    className="group glass flex items-start gap-3.5 p-3.5 transition-colors duration-300 hover:border-white/25"
                  >
                    <div className="border border-white/15 bg-black/30 p-2 text-neutral-300 shrink-0 transition-colors duration-300 group-hover:text-signal group-hover:border-signal/40">
                      <TraitIcon name={trait.icon} />
                    </div>
                    <div>
                      <h3 className="text-white font-light text-[15px] mb-0.5">{trait.title}</h3>
                      <p className="text-neutral-300 text-[13px] font-light leading-relaxed">{trait.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: bio + quote + education/focus */}
          <div className="lg:col-span-8 space-y-6">
            <div className="glass p-6 sm:p-8 space-y-5">
              {about.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-neutral-200 leading-relaxed font-light">
                  {paragraph}
                </p>
              ))}
            </div>

            <blockquote className="glass border-l-2 border-l-signal/60 pl-6 pr-5 py-5">
              <p className="text-neutral-200 italic font-light leading-relaxed">
                &ldquo;Earth is the cradle of humanity, but one cannot live in the cradle forever.&rdquo;
              </p>
              <footer className="mt-3 label-mono text-signal">
                &mdash; Konstantin Tsiolkovsky
              </footer>
            </blockquote>

            <div className="grid sm:grid-cols-2 gap-4">
              {[about.education, about.focus].map((list, listIndex) => (
                <div key={listIndex} className="glass p-5">
                  <h4 className="label-mono text-white mb-3 flex items-center gap-2">
                    <span aria-hidden="true" className="w-1 h-1 bg-signal" />
                    {list.title}
                  </h4>
                  {list.items.map((item, index) => (
                    <p key={index} className="text-neutral-300 text-sm font-light mb-1">{item}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Resume download control */}
        {about.resume.href && (
          <div className="flex justify-center mt-16">
            <a
              href={about.resume.href}
              download={about.resume.downloadName || ''}
              className="hud group glass flex w-full sm:w-auto sm:min-w-[24rem] items-center gap-4 p-3 pr-5 transition-colors duration-300 hover:border-signal/40 hover:bg-signal/[0.04]"
            >
              <span aria-hidden="true" className="grid place-items-center shrink-0 w-12 h-12 border border-white/15 bg-black/30 text-neutral-300 transition-colors duration-300 group-hover:text-signal group-hover:border-signal/40">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </span>
              <span className="flex flex-col gap-1.5 min-w-0 flex-1">
                <span className="font-display text-lg font-light leading-none text-white">{about.resume.label}</span>
                <span className="label-mono text-[10px] leading-none">
                  {`${(about.resume.href.split(/[?#]/)[0].split('.').pop() || 'file').toUpperCase()} · Download`}
                </span>
              </span>
              <svg
                aria-hidden="true"
                className="w-5 h-5 shrink-0 text-neutral-400 transition-[transform,color] duration-300 motion-safe:group-hover:translate-y-0.5 group-hover:text-signal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v11.25m0 0-4.5-4.5m4.5 4.5 4.5-4.5M5.25 19.5h13.5" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </section>
  );
};

export default About;
