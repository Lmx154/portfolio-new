import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    particlesJS: any;
  }
}

const ParticleBackground = () => {
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load particles.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js';
    script.onload = () => {
      if (window.particlesJS) {
        window.particlesJS('particles-js', {
          particles: {
            number: {
              value: 150,
              density: {
                enable: true,
                value_area: 800
              }
            },
            color: {
              value: '#ffffff'
            },
            shape: {
              type: 'circle',
              stroke: {
                width: 0,
                color: '#000000'
              }
            },
            opacity: {
              value: 0.8,
              random: true,
              anim: {
                enable: true,
                speed: 0.2,
                opacity_min: 0.3,
                sync: false
              }
            },
            size: {
              value: 2,
              random: true,
              anim: {
                enable: true,
                speed: 0.3,
                size_min: 0.8,
                sync: false
              }
            },
            line_linked: {
              enable: false
            },
            move: {
              enable: true,
              speed: 0.8,
              direction: 'left',
              random: false,
              straight: true,
              out_mode: 'out',
              bounce: false,
              attract: {
                enable: false
              }
            }
          },
          interactivity: {
            detect_on: 'canvas',
            events: {
              onhover: {
                enable: false
              },
              onclick: {
                enable: false
              },
              resize: true
            }
          },
          retina_detect: true
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div 
      id="particles-js" 
      ref={particlesRef}
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
};

export default ParticleBackground;