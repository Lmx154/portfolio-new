import RocketScene from './RocketScene';

const Hero = () => {
  return (
    <section id="hero" className="min-h-screen flex items-center justify-center pt-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl text-gray-300 tracking-wide font-light">
                LUIS MARTINEZ
              </h1>
              <p className="text-gray-400 text-lg font-light">
                Computer Science Student & Software Engineer
              </p>
            </div>
            
            <div className="space-y-6">
              <h2 className="text-5xl lg:text-6xl font-light text-white leading-tight">
                DEVELOPER.
              </h2>
              <h2 className="text-5xl lg:text-6xl font-light text-white leading-tight">
                PROBLEM SOLVER.
              </h2>
              <h2 className="text-5xl lg:text-6xl font-light text-white leading-tight">
                INNOVATOR.
              </h2>
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={() => document.getElementById('blog')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-gray-600 hover:bg-gray-500 text-white px-8 py-3 transition-colors font-light tracking-wide"
              >
                VIEW BLOG
              </button>
              <button
                onClick={() => document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' })}
                className="border border-gray-600 hover:border-gray-500 text-white px-8 py-3 transition-colors font-light tracking-wide"
              >
                PROJECTS
              </button>
            </div>
          </div>
          
          <div className="flex justify-center">
            <RocketScene />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;