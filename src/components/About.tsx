const About = () => {
  const traits = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      ),
      title: "Productive",
      description: "Consistently delivering high-quality code and innovative solutions"
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      title: "Self-Learner",
      description: "Continuously exploring new technologies and expanding skill sets"
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
      ),
      title: "Problem Solver",
      description: "Tackling complex challenges with creative and efficient solutions"
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
            <div className="w-80 h-80 bg-gray-800 border-4 border-gray-700 overflow-hidden">
              <img 
                src="/profile.jpg" 
                alt="Luis Martinez" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          
          {/* Description */}
          <div className="space-y-6">
            <p className="text-gray-300 leading-relaxed font-light">
              Hello! I'm Luis Martinez, a passionate software developer based in Weslaco, Texas, currently pursuing a Bachelor's degree in Computer Science at the University of Texas Rio Grande Valley (UTRGV). My journey into technology began at a young age, driven by a passion for problem-solving and creativity.
            </p>
            
            <p className="text-gray-300 leading-relaxed font-light">
              My first experiences with programming involved modding games and building simple websites, sparking a lifelong interest in tech. Before transferring to UTRGV, I earned an Associate's degree in Computer Science from South Texas College and gained hands-on experience in IT for approximately two years.
            </p>
            
            <p className="text-gray-300 leading-relaxed font-light">
              At UTRGV, I serve as the Avionics Lead for the Rocket Launchers Club, where I spearhead the development of advanced telemetry systems and flight computers for aerospace projects. I frequently attend hackathons, where I enjoy tackling challenges, learning from peers, and networking with other passionate developers. I'm passionate about continuous learning and innovation, always exploring emerging technologies and integrating them into my projects.
            </p>
            
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-gray-800 p-4 border border-gray-700">
                <h4 className="text-white font-light mb-2">EDUCATION</h4>
                <p className="text-gray-400 text-sm font-light">B.S. Computer Science</p>
                <p className="text-gray-400 text-sm font-light">UT Rio Grande Valley</p>
                <p className="text-gray-400 text-sm font-light">Associate's - South Texas College</p>
              </div>
              <div className="bg-gray-800 p-4 border border-gray-700">
                <h4 className="text-white font-light mb-2">FOCUS</h4>
                <p className="text-gray-400 text-sm font-light">Full-Stack Development</p>
                <p className="text-gray-400 text-sm font-light">Embedded Systems</p>
                <p className="text-gray-400 text-sm font-light">Aerospace Technology</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;