/**
 * True when the page was loaded with `?spacelab` in the query string.
 *
 * Lives in its own module, deliberately importing nothing from `./spacelab`
 * (which pulls in `three` and the whole harness). `App.tsx` calls this
 * synchronously on every render to decide whether to mount the harness, so it
 * must be checkable without paying for a 560 KB Three.js chunk on every
 * ordinary page load — see `App.tsx`'s `SpacelabPage` for the dynamic
 * `import('./spacelab')` that only pulls that chunk in once this returns true.
 */
export function isSpacelab(): boolean {
  return new URLSearchParams(window.location.search).has('spacelab');
}
