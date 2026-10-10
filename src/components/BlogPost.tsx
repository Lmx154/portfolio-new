import { useParams, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { blogPosts } from '../data/blogPosts';
import BlockRenderer from './BlockRenderer';
import { site } from '../data/site';

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const post = blogPosts.find(p => p.id === id);

  const title = post?.title;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — Luis Martinez`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (!post) {
    return (
      <div className="min-h-screen text-white pt-20">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h1 className="font-display text-4xl font-light mb-8 tracking-tight">Post Not Found</h1>
          <Link to="/" className="text-neutral-400 hover:text-white transition-colors text-sm tracking-wide">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pt-20">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Navigation */}
        <div className="mb-10">
          <Link
            to="/#blog"
            className="label-mono inline-flex items-center gap-2 text-neutral-400 hover:text-signal transition-colors text-legible"
          >
            <span aria-hidden="true">←</span>
            <span>Back to blog</span>
          </Link>
        </div>

        {/* Header */}
        <header className="mb-10">
          <div className="label-mono text-legible flex flex-wrap items-center gap-x-3 gap-y-1 mb-5">
            <time dateTime={post.date}>{post.date ? post.date.replace(/-/g, '.') : post.displayDate}</time>
            {post.readTime && (
              <>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span>{post.readTime.replace(/\s*read$/i, '')}</span>
              </>
            )}
          </div>
          <h1 className="font-display text-4xl lg:text-6xl font-light text-white text-legible mb-6 leading-[1.05] tracking-tight">
            {post.title}
          </h1>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <span
                  key={index}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] border border-white/10 bg-black/40 text-neutral-300 px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Content */}
        <article className="glass p-6 sm:p-10 max-w-none">
          <BlockRenderer blocks={post.blocks} />
        </article>

        {/* Navigation Footer */}
        <footer className="mt-16 pt-8 border-t border-white/10">
          <div className="flex justify-between items-center">
            <Link
              to="/#blog"
              className="label-mono text-legible hover:text-signal transition-colors"
            >
              ← All Posts
            </Link>
            <div className="flex space-x-5">
              {site.links.github && (
                <a href={site.links.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="text-neutral-400 hover:text-signal transition-colors">
                  <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
              )}
              {site.links.linkedin && (
                <a href={site.links.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-neutral-400 hover:text-signal transition-colors">
                  <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default BlogPost;
