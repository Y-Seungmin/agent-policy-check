import { matchesGlob } from './glob.js';

function matches(pattern: string, path: string): boolean {
  return matchesGlob(pattern, path);
}

export function hasMatchingPath(paths: string[], patterns: string[]): boolean {
  return paths.some((path) => patterns.some((pattern) => matches(pattern, path)));
}
