import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';

const Blog = () => {
  return (
    <section id="blog" className="py-20 bg-gray-900/50">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-4xl font-light text-white mb-12 tracking-wide">
          BLOG
        </h2>
        
        <div className="space-y-8">
          {blogPosts.map((post, index) => (
            <Link 
              key={index}
              to={`/blog/${post.id}`}
              className="block border-l-4 border-gray-600 pl-6 hover:border-gray-400 transition-colors group cursor-pointer"
            >
              <div className="text-gray-400 text-sm mb-2 tracking-wide font-light">
                {post.date}
              </div>
              <h3 className="text-2xl font-light text-white mb-3 group-hover:text-gray-300 transition-colors">
                {post.title}
              </h3>
              <p className="text-gray-300 leading-relaxed font-light mb-3">
                {post.excerpt}
              </p>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>{post.readTime}</span>
                <div className="flex flex-wrap gap-2">
                  {post.tags.slice(0, 3).map((tag, tagIndex) => (
                    <span key={tagIndex} className="px-2 py-1 bg-gray-800 text-gray-400 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Blog;