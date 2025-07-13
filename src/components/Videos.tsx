import React, { useState } from 'react';
import VideoGallery from './VideoGallery';
import { portfolioVideos, getVideosByCategory, VideoData } from '../data/videos';

const Videos: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<VideoData['category'] | 'all'>('all');

  const categories: Array<{ key: VideoData['category'] | 'all'; label: string }> = [
    { key: 'all', label: 'All Videos' },
    { key: 'rockets', label: 'Rockets' },
    { key: 'projects', label: 'Projects' },
    { key: 'demos', label: 'Demos' },
    { key: 'presentations', label: 'Presentations' }
  ];

  const filteredVideos = selectedCategory === 'all' 
    ? portfolioVideos 
    : getVideosByCategory(selectedCategory);

  return (
    <div className="min-h-screen text-white pt-20">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl lg:text-5xl font-light text-white mb-6">
            Video Portfolio
          </h1>
          <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto">
            Explore videos showcasing my work in avionics, rocket systems, and engineering projects
          </p>
        </header>

        {/* Category Filter */}
        <div className="mb-12">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <button
                key={category.key}
                onClick={() => setSelectedCategory(category.key)}
                className={`px-6 py-2 rounded-full transition-all duration-300 font-light ${
                  selectedCategory === category.key
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Video Count */}
        <div className="mb-8 text-center">
          <p className="text-gray-400 font-light">
            Showing {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Video Gallery */}
        {filteredVideos.length > 0 ? (
          <VideoGallery
            videos={filteredVideos.map(video => ({
              id: video.id,
              src: video.src,
              title: video.title,
              description: `${video.description} • ${video.date}${video.duration ? ` • ${video.duration}` : ''}`,
              autoplay: video.autoplay,
              loop: video.loop,
              muted: video.muted,
              controls: video.controls
            }))}
            gridCols={2}
            className="mb-20"
          />
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg font-light">
              No videos found in this category.
            </p>
          </div>
        )}

        {/* Video Upload Instructions */}
        <div className="mt-20 p-8 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-2xl font-light text-white mb-4">Adding New Videos</h3>
          <div className="text-gray-400 font-light space-y-2">
            <p>• Place video files in the <code className="bg-gray-800 px-2 py-1 rounded">/public/videos/</code> directory</p>
            <p>• Supported formats: MP4, WebM, OGV</p>
            <p>• Update the video data in <code className="bg-gray-800 px-2 py-1 rounded">src/data/videos.ts</code></p>
            <p>• Recommended resolution: 1920x1080 or 1280x720 for web optimization</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Videos;
