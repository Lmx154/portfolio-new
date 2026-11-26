import { ProjectSchema, type Project } from '../content/schema';

export type { Project };

/**
 * Loads project cards from JSON at build time and validates each against the
 * shared Zod schema (invalid content fails the build). One file per project in
 * src/content/projects/, sorted by `order`.
 */

const modules = import.meta.glob('../content/projects/*.json', { eager: true });

const loaded: Project[] = [];

for (const [path, mod] of Object.entries(modules)) {
  const result = ProjectSchema.safeParse((mod as { default: unknown }).default);
  if (!result.success) {
    const message = `[content] Invalid project "${path}":\n${result.error.message}`;
    if (import.meta.env.PROD) throw new Error(message);
    console.error(message);
    continue;
  }
  loaded.push(result.data);
}

loaded.sort((a, b) => a.order - b.order);

export const projects: Project[] = loaded;

/** Map a project status to its badge color (design owned by the site, not content). */
export function projectStatusColor(status: string): string {
  switch (status.trim().toLowerCase()) {
    case 'completed':
    case 'flight tested':
      return 'bg-green-600';
    case 'in progress':
      return 'bg-yellow-600';
    case 'planned':
      return 'bg-blue-600';
    default:
      return 'bg-gray-600';
  }
}
