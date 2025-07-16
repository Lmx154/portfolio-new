import React, { useEffect } from 'react';

interface ImageModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10 bg-black bg-opacity-50 rounded-full p-2"
          aria-label="Close image modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Image */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full w-auto h-auto object-contain"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '95vw', maxHeight: '95vh' }}
        />

        {/* Image caption */}
        {alt && (
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <p className="text-white text-sm font-light bg-black bg-opacity-70 px-4 py-2 rounded max-w-2xl mx-auto">
              {alt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageModal;
