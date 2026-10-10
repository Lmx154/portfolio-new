import ProjectGallery from './ProjectGallery';
import SectionHeading from './SectionHeading';
import { projects, projectStatusColor } from '../data/projects';
import type { MediaItem, Project } from '../content/schema';

/** Build the tile's media list: explicit gallery, else the single model/image. */
function projectMedia(project: Project): MediaItem[] {
  if (project.media.length) return project.media;
  if (project.model3d) return [{ type: 'model', src: project.model3d }];
  if (project.image) return [{ type: 'image', src: project.image, alt: project.title }];
  return [];
}

const Projects = () => {
  return (
    <section id="projects" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading
          index="02"
          title="Projects"
          meta={`${String(projects.length).padStart(2, '0')} builds`}
          className="mb-12"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project, index) => (
            <div
              key={index}
              className="hud group glass flex flex-col transition-colors duration-300 hover:border-white/25"
            >
              <div className="aspect-video bg-neutral-950 overflow-hidden border-b border-white/10">
                <ProjectGallery items={projectMedia(project)} title={project.title} />
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-light text-white tracking-tight">
                    {project.title}
                  </h3>
                  <svg aria-hidden="true" className="w-4 h-4 shrink-0 ml-3 text-neutral-600 group-hover:text-signal transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>

                <div className="label-mono mb-4 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${projectStatusColor(project.status)} ${
                      project.status.trim().toLowerCase() === 'in progress' ? 'signal-pulse' : ''
                    }`}
                  />
                  <span>{project.status}</span>
                </div>

                <p className="text-neutral-300 mb-5 leading-relaxed font-light text-sm">
                  {project.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {project.tags.map((tag, tagIndex) => (
                    <span
                      key={tagIndex}
                      className="font-mono text-[10px] uppercase tracking-[0.12em] border border-white/10 bg-black/25 text-neutral-400 px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 mt-auto">
                  {project.github && (
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-500 hover:text-signal transition-colors"
                      aria-label="View on GitHub"
                    >
                      <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </a>
                  )}
                  {project.deploymentUrl && (
                    <a
                      href={project.deploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-black px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-signal transition-colors"
                    >
                      Live Demo
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;
