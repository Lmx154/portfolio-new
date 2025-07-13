export interface VideoData {
  id: string;
  src: string;
  title: string;
  description?: string;
  thumbnail?: string;
  category: 'rockets' | 'projects' | 'demos' | 'presentations';
  date: string;
  duration?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}

export const portfolioVideos: VideoData[] = [
  {
    id: 'brunito-flight-test',
    src: '/videos/brunito-flight-test.mp4',
    title: 'Brunito Flight Computer Test',
    description: 'Testing the Brunito flight computer systems before launch',
    category: 'rockets',
    date: 'June 2024',
    duration: '2:30',
    controls: true,
    muted: true,
    autoplay: false,
    loop: false
  },
  {
    id: 'avionics-assembly',
    src: '/videos/avionics-assembly.mp4',
    title: 'Avionics Bay Assembly',
    description: 'Time-lapse of assembling the avionics bay for IREC competition',
    category: 'rockets',
    date: 'May 2024',
    duration: '1:45',
    controls: true,
    muted: true,
    autoplay: false,
    loop: false
  },
  {
    id: 'rocket-launch-slow-mo',
    src: '/videos/rocket-launch-slow-mo.mp4',
    title: 'Rocket Launch Slow Motion',
    description: 'Slow motion capture of our rocket launch at IREC',
    category: 'rockets',
    date: 'June 2024',
    duration: '0:45',
    controls: true,
    muted: false,
    autoplay: false,
    loop: true
  },
  {
    id: 'telemetry-demo',
    src: '/videos/telemetry-demo.mp4',
    title: 'Live Telemetry System Demo',
    description: 'Demonstration of the SENTINEL telemetry parsing system',
    category: 'demos',
    date: 'April 2024',
    duration: '3:15',
    controls: true,
    muted: true,
    autoplay: false,
    loop: false
  }
];

// Filter functions for easy categorization
export const getVideosByCategory = (category: VideoData['category']) => 
  portfolioVideos.filter(video => video.category === category);

export const getFeaturedVideos = () => 
  portfolioVideos.slice(0, 3); // Get first 3 as featured
