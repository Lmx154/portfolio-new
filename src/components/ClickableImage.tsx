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
      className={`cursor-pointer transition-transform hover:scale-105 ${className}`}
      onClick={handleClick}
    />
  );
};

export default ClickableImage;
