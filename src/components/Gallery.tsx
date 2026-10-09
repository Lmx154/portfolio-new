import ClickableImage from './ClickableImage';
import { galleryItems } from '../data/gallery';

const Gallery = () => {
  return (
    <section id="gallery" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-6 mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-[0.1em] text-white whitespace-nowrap">
            COMMUNITY INVOLVEMENT
          </h2>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="mb-12 max-w-3xl">
          <p className="text-neutral-400 font-light leading-relaxed text-[15px]">
            As Avionics Lead for Rocket Launchers at UTRGV, I took part in rocketry competitions, design reviews, hackathons and industry visits. These experiences sharpened my technical skills and taught me how to lead and collaborate across a multidisciplinary team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleryItems.map((image) => (
            <div
              key={image.id}
              className="group cursor-pointer border border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04] transition-all duration-300 overflow-hidden"
            >
              <div className="aspect-square bg-neutral-950 overflow-hidden">
                <ClickableImage
                  src={image.src}
                  alt={image.alt}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-5">
                <h3 className="font-display text-base font-light text-white mb-1.5 tracking-tight group-hover:text-neutral-300 transition-colors">
                  {image.title}
                </h3>
                <p className="text-neutral-400 text-sm font-light leading-relaxed">
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
