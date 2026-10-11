import React, { useEffect, useRef } from 'react';

interface ImageModalProps {
  src: string;
  alt?: string;
  type?: 'image' | 'video';
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ src, alt = '', type = 'image', onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div 
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Media viewer'}
      tabIndex={-1}
      className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 outline-none"
      onClick={onClose}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10 bg-black bg-opacity-50 p-2"
          aria-label="Close media modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Media */}
        {type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '95vh' }}
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '95vh' }}
          />
        )}

        {/* Caption */}
        {alt && (
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <p className="text-white text-sm font-light bg-black/70 px-4 py-2 max-w-2xl mx-auto">
              {alt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageModal;
