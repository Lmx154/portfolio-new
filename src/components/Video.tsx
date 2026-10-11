import React from 'react';
import { useImageModal } from './ImageModalProvider';

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
  // autoplay and loop are not used for inline preview
  muted = true,
  controls = true,
  className = ''
}) => {
  const { openModal } = useImageModal();

  const handleOpen = () => {
    openModal(src, alt, 'video');
  };
  return (
    <div className={`video-container ${className} cursor-pointer`} onClick={handleOpen}>
      <div className="flex justify-center relative">
        {/* small inline preview - clicking opens modal */}
        <video
          src={src}
          // do not autoplay inline preview
          autoPlay={false}
          loop={false}
          muted={muted}
          controls={controls}
          className="w-full h-auto border border-white/10 object-cover"
          aria-label={alt}
          preload="metadata"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black bg-opacity-40 p-3">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      {caption && (
        <p className="text-neutral-500 text-sm font-light mt-3 text-center">
          {caption}
        </p>
      )}
    </div>
  );
};

export default Video;
