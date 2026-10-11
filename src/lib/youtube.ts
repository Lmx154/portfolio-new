const ID = /^[\w-]{11}$/;

/** Extracts the 11-character video id from a YouTube watch / youtu.be / shorts / embed URL, or null. */
export function parseYouTubeId(src: string | null | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, rest] = url.pathname.split('/');
    if (kind === 'watch') id = url.searchParams.get('v');
    else if (kind === 'shorts' || kind === 'embed' || kind === 'live') id = rest ?? null;
  }
  return id && ID.test(id) ? id : null;
}

export const youTubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youTubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
