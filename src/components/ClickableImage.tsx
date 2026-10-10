import React from 'react';
import { useImageModal } from './ImageModalProvider';

interface ClickableImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

const ClickableImage: React.FC<ClickableImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  onClick 
}) => {
  const { openModal } = useImageModal();

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
    openModal(src, alt);
  };

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`cursor-zoom-in ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={alt ? `Open image: ${alt}` : 'Open image'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    />
  );
};

export default ClickableImage;
