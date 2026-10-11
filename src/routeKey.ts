/**
 * Route-marker contract (ADR-001). Every prerendered HTML file carries
 * `<div id="root" data-prerendered-route="<key>">`, where `<key>` is the route
 * the markup was rendered for. The client hydrates only when that marker equals
 * the key of the URL it is actually showing; anything else (no marker in dev /
 * CMS preview, a host rewrite serving another route's HTML, the 404 page)
 * falls back to a fresh client render.
 */

/** Normalises a pathname to its route key: "/blog/marv-v2/" -> "/blog/marv-v2", "" -> "/". */
export function routeKey(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** True when the container's prerendered markup was rendered for `pathname`. */
export function matchesPrerenderedRoute(marker: string | null | undefined, pathname: string): boolean {
  return typeof marker === 'string' && marker !== '' && marker === routeKey(pathname);
}
