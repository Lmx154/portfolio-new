import React, { createContext, useContext, useState } from 'react';
import ImageModal from './ImageModal';

interface ImageModalContextType {
  openModal: (src: string, alt: string) => void;
  closeModal: () => void;
}

const ImageModalContext = createContext<ImageModalContextType | undefined>(undefined);

export const useImageModal = () => {
  const context = useContext(ImageModalContext);
  if (!context) {
    throw new Error('useImageModal must be used within an ImageModalProvider');
  }
  return context;
};

interface ImageModalProviderProps {
  children: React.ReactNode;
}

export const ImageModalProvider: React.FC<ImageModalProviderProps> = ({ children }) => {
  const [modalData, setModalData] = useState<{ src: string; alt: string } | null>(null);

  const openModal = (src: string, alt: string) => {
    setModalData({ src, alt });
  };

  const closeModal = () => {
    setModalData(null);
  };

  return (
    <ImageModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {modalData && (
        <ImageModal 
          src={modalData.src} 
          alt={modalData.alt} 
          onClose={closeModal} 
        />
      )}
    </ImageModalContext.Provider>
  );
};
