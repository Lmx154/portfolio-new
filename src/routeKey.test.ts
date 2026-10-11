import { describe, expect, it } from 'vitest';
import { matchesPrerenderedRoute, routeKey } from './routeKey';

describe('routeKey', () => {
  it('keeps the root as "/"', () => {
    expect(routeKey('/')).toBe('/');
    expect(routeKey('')).toBe('/');
    expect(routeKey('//')).toBe('/');
  });

  it('strips trailing slashes from post paths', () => {
    expect(routeKey('/blog/marv-v2')).toBe('/blog/marv-v2');
    expect(routeKey('/blog/marv-v2/')).toBe('/blog/marv-v2');
    expect(routeKey('/blog/marv-v2//')).toBe('/blog/marv-v2');
  });
});

describe('matchesPrerenderedRoute', () => {
  it('matches the route the markup was rendered for, with or without a trailing slash', () => {
    expect(matchesPrerenderedRoute('/', '/')).toBe(true);
    expect(matchesPrerenderedRoute('/blog/marv-v2', '/blog/marv-v2')).toBe(true);
    expect(matchesPrerenderedRoute('/blog/marv-v2', '/blog/marv-v2/')).toBe(true);
  });

  it('rejects markup rendered for a different route', () => {
    expect(matchesPrerenderedRoute('/', '/blog/marv-v2')).toBe(false);
    expect(matchesPrerenderedRoute('/blog/marv-v2', '/blog/marv')).toBe(false);
    expect(matchesPrerenderedRoute('/404', '/does-not-exist')).toBe(false);
    expect(matchesPrerenderedRoute('/blog/marv-v2', '/Blog/MARV-V2')).toBe(false);
  });

  it('rejects a missing or empty marker (dev / CMS preview)', () => {
    expect(matchesPrerenderedRoute(undefined, '/')).toBe(false);
    expect(matchesPrerenderedRoute(null, '/')).toBe(false);
    expect(matchesPrerenderedRoute('', '/')).toBe(false);
  });
});
