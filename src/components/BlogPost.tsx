import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const post = blogPosts.find(p => p.id === id);

  if (!post) {
    return (
      <div className="min-h-screen bg-black text-white pt-20">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h1 className="text-4xl font-light mb-8">Post Not Found</h1>
          <Link to="/" className="text-gray-400 hover:text-white transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pt-20">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Navigation */}
        <div className="mb-8">
          <Link 
            to="/" 
            className="text-gray-400 hover:text-white transition-colors font-light flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-4xl lg:text-5xl font-light text-white mb-6 leading-tight">
            {post.title}
          </h1>
          <div className="flex items-center space-x-4 text-gray-400 font-light">
            <span>{post.date}</span>
            <span>•</span>
            <span>{post.readTime}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-6">
            {post.tags.map((tag, index) => (
              <span key={index} className="px-3 py-1 bg-gray-800 text-gray-300 text-sm font-light">
                {tag}
              </span>
            ))}
          </div>
        </header>

        {/* Content */}
        <article className="prose prose-invert max-w-none">
          {post.content.sections.map((section, index) => {
            switch (section.type) {
              case 'heading':
                return (
                  <h2 key={index} className="text-3xl font-light text-white mt-12 mb-6">
                    {section.content}
                  </h2>
                );
              case 'text':
                return (
                  <p key={index} className="text-gray-300 leading-relaxed font-light mb-6 text-lg">
                    {section.content}
                  </p>
                );
              case 'image':
                return (
                  <div key={index} className="my-12">
                    <img 
                      src={section.content} 
                      alt={section.alt || ''} 
                      className="w-full h-auto border border-gray-700"
                    />
                    {section.alt && (
                      <p className="text-gray-500 text-sm font-light mt-2 text-center">
                        {section.alt}
                      </p>
                    )}
                  </div>
                );
              default:
                return null;
            }
          })}
        </article>

        {/* Navigation Footer */}
        <footer className="mt-20 pt-12 border-t border-gray-800">
          <div className="flex justify-between items-center">
            <Link 
              to="/" 
              className="text-gray-400 hover:text-white transition-colors font-light"
            >
              ← All Posts
            </Link>
            <div className="flex space-x-6">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default BlogPost;