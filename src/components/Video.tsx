import React from 'react';

interface VideoProps {
  src: string;
  alt?: string;
  caption?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
}

const Video: React.FC<VideoProps> = ({
  src,
  alt,
  caption,
  autoplay = false,
  loop = false,
  muted = true,
  controls = true,
  className = ''
}) => {
  return (
    <div className={`video-container ${className}`}>
      <div className="flex justify-center">
        <video
          src={src}
          autoPlay={autoplay}
          loop={loop}
          muted={muted}
          controls={controls}
          className="max-w-md w-full h-auto border border-gray-700 rounded-lg"
          aria-label={alt}
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
      {caption && (
        <p className="text-gray-500 text-sm font-light mt-2 text-center">
          {caption}
        </p>
      )}
    </div>
  );
};

export default Video;
