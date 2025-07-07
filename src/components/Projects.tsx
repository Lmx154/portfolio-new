import React from 'react';

const Projects = () => {
  const projects = [
    {
      title: "PORTFOLIO WEBSITE",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=600",
      description: "Personal portfolio website built with React, TypeScript, and Tailwind CSS. Features responsive design, dark theme, and smooth animations.",
      tags: ["React", "TypeScript", "Tailwind CSS", "Responsive", "Portfolio"]
    },
    {
      title: "TASK MANAGEMENT APP",
      status: "In Progress",
      statusColor: "bg-yellow-600",
      image: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=600",
      description: "Full-stack task management application with user authentication, real-time updates, and collaborative features.",
      tags: ["React", "Node.js", "MongoDB", "Socket.io", "Authentication"]
    },
    {
      title: "E-COMMERCE PLATFORM",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "https://images.pexels.com/photos/230544/pexels-photo-230544.jpeg?auto=compress&cs=tinysrgb&w=600",
      description: "Modern e-commerce platform with shopping cart, payment integration, and admin dashboard for inventory management.",
      tags: ["React", "Express", "PostgreSQL", "Stripe", "Admin Panel"]
    },
    {
      title: "WEATHER DASHBOARD",
      status: "Completed",
      statusColor: "bg-green-600",
      image: "https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg?auto=compress&cs=tinysrgb&w=600",
      description: "Interactive weather dashboard with location-based forecasts, historical data visualization, and responsive design.",
      tags: ["JavaScript", "API Integration", "Charts.js", "Responsive", "Weather"]
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
                
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag, tagIndex) => (
                    <span key={tagIndex} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs font-light">
                      {tag}
                    </span>
                  ))}
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