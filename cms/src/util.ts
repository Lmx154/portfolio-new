/** Shared CMS helpers (kept out of component files so fast-refresh stays happy). */

/** "My Robot Arm!" → "my-robot-arm". */
export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
