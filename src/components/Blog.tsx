import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';
import SectionHeading from './SectionHeading';

/** "2026-09-19" -> "2026.09.19"; falls back to the human date for drafts. */
const stamp = (date: string | undefined, fallback: string | undefined) =>
  date ? date.replace(/-/g, '.') : fallback ?? '';

const Blog = () => {
  return (
    <section id="blog" className="py-24">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeading
          index="01"
          title="Blog"
          meta={`${String(blogPosts.length).padStart(2, '0')} posts`}
          className="mb-12"
        />

        <div className="space-y-6">
          {blogPosts.length === 0 && (
            <div className="glass p-6 text-neutral-400 font-light">No blog posts available.</div>
          )}
          {blogPosts.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.id}`}
              className="hud group glass block p-6 sm:p-7 transition-colors duration-300 hover:border-white/25 hover:bg-[rgba(8,11,16,0.7)]"
            >
              <div className="label-mono flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 pr-8">
                <time dateTime={post.date}>{stamp(post.date, post.displayDate)}</time>
                {post.readTime && (
                  <>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span>{post.readTime.replace(/\s*read$/i, '')}</span>
                  </>
                )}
              </div>
              <h3 className="font-display text-2xl font-light text-white mb-3 tracking-tight pr-8">
                {post.title}
              </h3>
              <p className="text-neutral-300 leading-relaxed font-light mb-5 text-[15px]">
                {post.excerpt}
              </p>
              <div className="flex flex-wrap gap-2">
                {post.tags.slice(0, 3).map((tag, tagIndex) => (
                  <span
                    key={tagIndex}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] border border-white/10 bg-black/25 text-neutral-400 px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <span
                aria-hidden="true"
                className="absolute right-6 top-6 font-mono text-signal opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Blog;
