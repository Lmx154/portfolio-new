import { useImageModal } from './ImageModalProvider';
import { galleryItems } from '../data/gallery';
import SectionHeading from './SectionHeading';

const pad = (n: number) => String(n).padStart(2, '0');

const Gallery = () => {
  const { openModal } = useImageModal();

  return (
    <section id="gallery" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading
          index="04"
          title="Community Involvement"
          meta={`${pad(galleryItems.length)} missions`}
          className="mb-10"
        />

        <div className="mb-12 max-w-3xl">
          <p className="text-neutral-300 text-legible font-light leading-relaxed text-[15px]">
            As Avionics Lead for Rocket Launchers at UTRGV, I took part in rocketry competitions, design reviews, hackathons and industry visits. These experiences sharpened my technical skills and taught me how to lead and collaborate across a multidisciplinary team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleryItems.map((image, index) => (
            <div
              key={image.id}
              className="hud group glass transition-colors duration-300 hover:border-white/25"
            >
              <div className="aspect-square bg-neutral-950 overflow-hidden">
                <button
                  type="button"
                  onClick={() => openModal(image.src, image.alt)}
                  className="block w-full h-full cursor-pointer focus-visible:[outline-offset:-3px]"
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none"
                  />
                </button>
              </div>

              <div className="p-5 border-t border-white/10">
                <div className="label-mono text-neutral-400 mb-2">
                  {pad(index + 1)} / {pad(galleryItems.length)}
                </div>
                <h3 className="font-display text-base font-light text-white mb-1.5 tracking-tight">
                  {image.title}
                </h3>
                <p className="text-neutral-300 text-sm font-light leading-relaxed">
                  {image.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Gallery;
