const Contact = () => {
  return (
    <section id="contact" className="py-20">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-4xl font-light text-white mb-12 tracking-wide">
          CONTACT ME
        </h2>
        
        <div className="bg-gray-800/50 border border-gray-700 p-8">
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-300 mb-2 text-sm font-light tracking-wide">
                  NAME
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 focus:border-gray-500 focus:outline-none transition-colors font-light"
                  placeholder="Your Name"
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2 text-sm font-light tracking-wide">
                  EMAIL
                </label>
                <input
                  type="email"
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 focus:border-gray-500 focus:outline-none transition-colors font-light"
                  placeholder="your.email@example.com"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-light tracking-wide">
                SUBJECT
              </label>
              <input
                type="text"
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 focus:border-gray-500 focus:outline-none transition-colors font-light"
                placeholder="Project Collaboration"
              />
            </div>
            
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-light tracking-wide">
                MESSAGE
              </label>
              <textarea
                rows={6}
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 focus:border-gray-500 focus:outline-none transition-colors resize-none font-light"
                placeholder="Tell me about your project or question..."
              />
            </div>
            
            <div className="border border-gray-600 p-4 bg-gray-900">
              <label className="flex items-center space-x-3 text-gray-300">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-gray-600"
                />
                <span className="text-sm font-light">I'm not a robot (Placeholder CAPTCHA)</span>
              </label>
            </div>
            
            <button
              type="submit"
              className="bg-gray-600 hover:bg-gray-500 text-white px-8 py-3 transition-colors font-light tracking-wide flex items-center space-x-2"
            >
              <span>SEND MESSAGE</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;