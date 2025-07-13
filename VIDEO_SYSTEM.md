# Video System Documentation

This portfolio now supports video content in multiple ways. Here's how to use each component:

## 1. Video Component (`Video.tsx`)
A reusable video player component for individual videos.

### Usage:
```tsx
import Video from './components/Video';

<Video
  src="/videos/my-video.mp4"
  caption="Video description"
  controls={true}
  muted={true}
  autoplay={false}
  loop={false}
/>
```

### Props:
- `src`: Video file path (required)
- `alt`: Alternative text for accessibility
- `caption`: Text displayed below the video
- `autoplay`: Auto-play video (default: false)
- `loop`: Loop video (default: false)
- `muted`: Mute video (default: true)
- `controls`: Show video controls (default: true)

## 2. VideoGallery Component (`VideoGallery.tsx`)
Display multiple videos in a grid layout.

### Usage:
```tsx
import VideoGallery from './components/VideoGallery';

const videos = [
  {
    id: 'video1',
    src: '/videos/video1.mp4',
    title: 'My First Video',
    description: 'Description here'
  }
];

<VideoGallery videos={videos} gridCols={2} />
```

## 3. EmbeddedVideo Component (`EmbeddedVideo.tsx`)
For embedding YouTube videos or simple video files.

### Usage:
```tsx
import EmbeddedVideo from './components/EmbeddedVideo';

// YouTube video
<EmbeddedVideo src="https://youtube.com/watch?v=VIDEO_ID" />

// Local video file
<EmbeddedVideo src="/videos/my-video.mp4" />
```

## 4. Blog Post Videos
Videos can now be added to blog posts by updating the content sections.

### In blogPosts.ts:
```typescript
{
  type: 'video',
  content: '/videos/my-video.mp4',
  caption: 'Video description',
  controls: true,
  muted: true,
  autoplay: false,
  loop: false
}
```

## 5. Videos Page (`Videos.tsx`)
A dedicated page to showcase all your videos with category filtering.

### Features:
- Category filtering (rockets, projects, demos, presentations)
- Responsive grid layout
- Video metadata display
- Search and filter capabilities

## File Organization

### Video Files Location:
Place your video files in: `/public/videos/`

### Supported Formats:
- MP4 (recommended)
- WebM
- OGV

### Recommended Settings:
- Resolution: 1920x1080 or 1280x720
- Format: MP4 with H.264 codec
- Bitrate: 2-5 Mbps for good quality/size balance

## Adding New Videos

1. **Add video file** to `/public/videos/` directory
2. **Update video data** in `src/data/videos.ts`
3. **Reference in blog posts** or use components directly

### Example video data entry:
```typescript
{
  id: 'unique-video-id',
  src: '/videos/filename.mp4',
  title: 'Video Title',
  description: 'Video description',
  category: 'rockets', // or 'projects', 'demos', 'presentations'
  date: 'June 2024',
  duration: '2:30',
  controls: true,
  muted: true,
  autoplay: false,
  loop: false
}
```

## Integration with Existing Components

The video system integrates seamlessly with your existing portfolio structure:

- **Blog posts**: Videos appear inline with other content
- **Projects page**: Can showcase project videos
- **Gallery**: Can include video content alongside images
- **Hero section**: Can feature background videos

## Performance Considerations

- Videos are loaded with `preload="metadata"` by default
- Autoplay is disabled by default to save bandwidth
- Videos are muted by default (required for autoplay in most browsers)
- Consider creating thumbnail images for better loading experience

## Accessibility

- All videos include proper ARIA labels
- Fallback content for browsers that don't support video
- Keyboard navigation support through native controls
- Caption support ready for future implementation
