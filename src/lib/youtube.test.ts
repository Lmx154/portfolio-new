import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from './youtube';

describe('parseYouTubeId', () => {
  it('parses watch URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be URLs', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
  });
  it('parses shorts URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('rejects non-YouTube and malformed input', () => {
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
    expect(parseYouTubeId('/videos/x.mp4')).toBeNull();
    expect(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/')).toBeNull();
    expect(parseYouTubeId('javascript:alert(1)')).toBeNull();
  });
  it('parses embed and live URLs', () => {
    expect(parseYouTubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('rejects look-alike hosts and ids with unsafe characters', () => {
    expect(parseYouTubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeId('https://evilyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgX%22Q')).toBeNull();
  });
});
