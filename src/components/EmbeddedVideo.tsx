import React from 'react';

interface EmbeddedVideoProps {
  src: string;
  title?: string;
  width?: number | string;
  height?: number | string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
}

const EmbeddedVideo: React.FC<EmbeddedVideoProps> = ({
  src,
  title = 'Video',
  width = '100%',
  height = 'auto',
  autoplay = false,
  loop = false,
  muted = true,
  controls = true,
  className = ''
}) => {
  // Check if it's a YouTube URL and handle accordingly
  const isYouTube = src.includes('youtube.com') || src.includes('youtu.be');
  
  if (isYouTube) {
    // Extract video ID from YouTube URL
    let videoId = '';
    if (src.includes('youtube.com/watch?v=')) {
      videoId = src.split('v=')[1].split('&')[0];
    } else if (src.includes('youtu.be/')) {
      videoId = src.split('youtu.be/')[1].split('?')[0];
    }
    
    const embedSrc = `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`;
    
    return (
      <div className={`embedded-video ${className}`}>
        <iframe
          width={width}
          height={height}
          src={embedSrc}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-auto min-h-[300px] border border-gray-700 rounded-lg"
        />
      </div>
    );
  }

  // For regular video files
  return (
    <div className={`embedded-video ${className}`}>
      <video
        width={width}
        height={height}
        src={src}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        controls={controls}
        className="w-full h-auto border border-gray-700 rounded-lg"
        preload="metadata"
      >
        <p className="text-gray-400 text-center py-8">
          Your browser does not support the video tag.
          <a href={src} className="text-blue-400 hover:text-blue-300 ml-2">
            Download the video
          </a>
        </p>
      </video>
    </div>
  );
};

export default EmbeddedVideo;
