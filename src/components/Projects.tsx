const Projects = () => {
  const projects = [
    {
      title: "ROCKET GAME",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/rocketGame.png",
      description: "A 2D arcade-style rocket game showcasing cross-platform development with Flutter and Dart, featuring a custom ASP.NET Core (C#) backend. Implemented custom API for score submission, deployed on Azure with PostgreSQL on Neon.tech.",
      tags: ["Flutter", "Dart", "C#", "ASP.NET", "SQL", "Postgres"],
      deploymentUrl: "https://rocketcs.web.app/",
      github: "https://github.com/Lmx154/dart_demo"
    },
    {
      title: "TDAS-GUI",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/das-gui.png",
      description: "Modernized the UTRGV Rocket Launchers telemetry visualization system. Built with Tauri 2.0, utilizing Rust for backend performance and React for frontend. Integrated high-frequency data handling (up to 100Hz).",
      tags: ["Rust", "Tauri", "Tailwind", "JavaScript", "React"],
      github: "https://github.com/Lmx154/TDAS-GUI"
    },
    {
      title: "PORTFOLIO SITE",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/portfolio.png",
      description: "A refresh of my personal portfolio website, emphasizing scalable architecture and modern web development practices. Built with TypeScript and React, styled with Tailwind CSS, hosted on Render.",
      tags: ["TypeScript", "React", "Tailwind", "Node.js"],
      deploymentUrl: "https://luisamartinez.xyz/",
      github: "https://github.com/Lmx154/portfolio"
    },
    {
      title: "SENTINEL",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/sentinel.png",
      description: "Next-generation rocket telemetry system for UTRGV Rocket Launchers, building on the TDAS-GUI prototype. Implemented real-time 3D rocket orientation tracking and flight trajectory visualization.",
      tags: ["Rust", "Tauri", "Tailwind", "JavaScript", "React"],
      github: "https://github.com/andrewalvrz/SENTINEL"
    },
    {
      title: "BRUNITO",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/brunito.jpg",
      description: "Comprehensive multi-board flight computer system and ground station for advanced rocketry telemetry. Implemented dual-board architecture with multiple sensors and real-time communication protocols using LoRa radio.",
      tags: ["C++", "Embedded"]
    },
    {
      title: "APPLYTRON",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/applytron.png",
      description: "Browser extension that allows users to autofill online job applications by extracting forms/fields and using AI to fill them with resume information. Streamlines the job application process significantly.",
      tags: ["AI", "JavaScript"]
    },
    {
      title: "SARE CLINOSTAT PROJECT",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "/clinostat.png",
      description: "Led development of a high-precision clinostat control system, integrating Rust, React, and ESP32-based hardware. Selected as a finalist in the 2025 NASA MINDS competition. Architected Tauri 2.0 desktop app for real-time motor control.",
      tags: ["Rust", "Tauri", "Tailwind", "JavaScript", "React"],
      github: "https://github.com/Lmx154/clinostat"
    }
  ];

  return (
    <section id="projects" className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-light text-white mb-12 tracking-wide">
          PROJECTS
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project, index) => (
            <div key={index} className="bg-gray-800/50 border border-gray-700 hover:border-gray-600 transition-colors group cursor-pointer">
              <div className="aspect-video bg-gray-900 overflow-hidden">
                <img 
                  src={project.image} 
                  alt={project.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-light text-white group-hover:text-gray-300 transition-colors">
                    {project.title}
                  </h3>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                
                <div className="mb-4">
                  <span className={`inline-block px-3 py-1 text-xs font-light text-white ${project.statusColor}`}>
                    {project.status}
                  </span>
                </div>
                
                <p className="text-gray-300 mb-4 leading-relaxed font-light">
                  {project.description}
                </p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.tags.map((tag, tagIndex) => (
                    <span key={tagIndex} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs font-light">
                      {tag}
                    </span>
                  ))}
                </div>
                
                <div className="flex items-center gap-4 mt-4">
                  {project.github && (
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="View on GitHub"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </a>
                  )}
                  {project.deploymentUrl && (
                    <a
                      href={project.deploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-light hover:bg-blue-700 transition-colors"
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