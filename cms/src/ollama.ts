/**
 * Small helpers around the local Ollama chat used by the merge-conflict helper:
 * persisted settings (server URL + model), the system prompt that turns a model
 * into a careful JSON-merge assistant, and pulling the proposed JSON back out of
 * a reply so we can validate it before writing.
 */

const BASE_KEY = 'portfolio-cms.ollama.base';
const MODEL_KEY = 'portfolio-cms.ollama.model';

export const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';
/** A small, fast local model is plenty for merging a few JSON fields. The model
 *  picker overrides this with whatever Ollama actually has installed. */
export const DEFAULT_OLLAMA_MODEL = 'gemma4:e4b';

export const getOllamaBase = () => localStorage.getItem(BASE_KEY) || DEFAULT_OLLAMA_BASE;
export const setOllamaBase = (v: string) => localStorage.setItem(BASE_KEY, v.trim() || DEFAULT_OLLAMA_BASE);
export const getOllamaModel = () => localStorage.getItem(MODEL_KEY) || DEFAULT_OLLAMA_MODEL;
export const setOllamaModel = (v: string) => localStorage.setItem(MODEL_KEY, v.trim() || DEFAULT_OLLAMA_MODEL);

/** Friendly, human-readable name for a conflicted content file path. */
export function friendlyName(path: string): string {
  const p = path.replace(/\\/g, '/');
  const blog = p.match(/src\/content\/blog\/([^/]+)\//);
  if (blog) return `Blog post “${blog[1]}”`;
  const project = p.match(/src\/content\/projects\/([^/]+)\.json$/);
  if (project) return `Project: ${project[1]}`;
  if (/src\/content\/gallery\//.test(p)) return 'Gallery';
  if (/src\/content\/about\//.test(p)) return 'About section';
  if (/src\/content\/site\//.test(p)) return 'Site settings (homepage hero, links, footer)';
  return path;
}

/** Pretty-print JSON text when possible; otherwise return it unchanged. */
export function tryPretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function conflictSystemPrompt(path: string): string {
  return [
    'You are a careful merge assistant helping a non-technical website editor combine two versions of a content file.',
    `The file is: ${path}`,
    'It was edited in two places (e.g. two computers) at the same time. Your job is to produce ONE merged version that keeps BOTH sets of intended changes.',
    'Rules:',
    '- The file is JSON. Your final answer MUST be the complete, valid JSON for the whole file, inside a single ```json code block.',
    '- Keep every field. Only change fields that actually differ between the two versions.',
    '- When the two versions changed DIFFERENT fields, keep both changes.',
    '- When they changed the SAME field to different values, you cannot know which is right: briefly explain the difference in plain English and ask the editor which to keep, then still include your best-guess JSON so they can apply it if they agree.',
    '- Never invent content that is not in either version. Do not add commentary inside the JSON.',
    '- Keep explanations short and non-technical (no talk of git, HEAD, or branches).',
  ].join('\n');
}

/**
 * Extract the merged JSON from a model reply — prefers a ```json fenced block,
 * falls back to the first balanced {...} object. Returns null if none found.
 */
export function extractJson(reply: string): string | null {
  const fence = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : reply;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}
