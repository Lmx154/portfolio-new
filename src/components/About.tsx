import React from 'react';

const About = () => {
  const traits = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Innovative",
      description: "Constantly exploring new technologies and creative solutions"
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
      title: "Technical Expert",
      description: "Proficient in multiple programming languages and frameworks"
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      title: "Collaborative",
      description: "Strong team player with excellent communication skills"
    }
  ];

  return (
    <section id="about" className="py-20 bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-light text-white mb-12 tracking-wide">
          ABOUT ME
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Traits */}
          <div className="space-y-6">
            {traits.map((trait, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="bg-gray-600 p-3 text-white">
                  {trait.icon}
                </div>
                <div>
                  <h3 className="text-white font-light mb-1">{trait.title}</h3>
                  <p className="text-gray-400 text-sm font-light">{trait.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Profile Image */}
          <div className="flex justify-center">
            <div className="w-80 h-80 bg-gray-800 border-4 border-gray-700 flex items-center justify-center">
              <div className="text-6xl text-gray-600">
                <svg className="w-32 h-32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Description */}
          <div className="space-y-6">
            <p className="text-gray-300 leading-relaxed font-light">
              Hello! I'm Luis Martinez, a passionate Computer Science student at the University of Texas Rio Grande Valley. 
              I specialize in full-stack development, machine learning, and creating innovative solutions to complex problems.
            </p>
            
            <p className="text-gray-300 leading-relaxed font-light">
              My journey in technology began with a curiosity about how things work, which evolved into a deep passion 
              for software development. I enjoy working on projects that challenge me to learn new technologies and 
              push the boundaries of what's possible.
            </p>
            
            <p className="text-gray-300 leading-relaxed font-light">
              When I'm not coding, you can find me exploring new frameworks, contributing to open-source projects, 
              or working on personal projects that solve real-world problems. I believe in continuous learning and 
              staying up-to-date with the latest industry trends.
            </p>
            
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-gray-800 p-4 border border-gray-700">
                <h4 className="text-white font-light mb-2">EDUCATION</h4>
                <p className="text-gray-400 text-sm font-light">B.S. Computer Science</p>
                <p className="text-gray-400 text-sm font-light">UT Rio Grande Valley</p>
              </div>
              <div className="bg-gray-800 p-4 border border-gray-700">
                <h4 className="text-white font-light mb-2">FOCUS</h4>
                <p className="text-gray-400 text-sm font-light">Full-Stack Development</p>
                <p className="text-gray-400 text-sm font-light">Machine Learning</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;