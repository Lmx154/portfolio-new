import React from 'react';
import Video from './Video';

interface VideoItem {
  id: string;
  src: string;
  title: string;
  description?: string;
  thumbnail?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}

interface VideoGalleryProps {
  videos: VideoItem[];
  className?: string;
  gridCols?: 1 | 2 | 3 | 4;
}

const VideoGallery: React.FC<VideoGalleryProps> = ({
  videos,
  className = '',
  gridCols = 2
}) => {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  };

  return (
    <div className={`video-gallery ${className}`}>
      <div className={`grid gap-8 ${gridClass[gridCols]}`}>
        {videos.map((video) => (
          <div key={video.id} className="video-item">
            <Video
              src={video.src}
              alt={video.title}
              caption={video.title}
              autoplay={video.autoplay}
              loop={video.loop}
              muted={video.muted}
              controls={video.controls}
              className="mb-4"
            />
            {video.description && (
              <p className="text-gray-400 text-sm font-light">
                {video.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoGallery;
