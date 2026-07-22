import { isSupportedGlob, matchesGlob } from './glob.js';

export interface CodeownersEntry {
  pattern: string;
  owners: string[];
}

export function parseCodeowners(text: string): CodeownersEntry[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const content = line.trim();
    if (!content || content.startsWith('#')) return [];
    const fields = content.split(/\s+/);
    const pattern = fields.shift();
    if (!pattern || !isSupportedGlob(pattern)) return [];
    const commentIndex = fields.findIndex((field) => field.startsWith('#'));
    const owners = fields.slice(0, commentIndex === -1 ? fields.length : commentIndex);
    if (owners.some((owner) => !isOwner(owner))) return [];
    return [{ pattern, owners }];
  });
}

export function hasCodeownersCoverage(
  entries: CodeownersEntry[],
  changedPaths: string[],
): boolean {
  return changedPaths.every((path) => {
    const matching = entries.filter((entry) => matches(entry.pattern, path));
    return matching.at(-1)?.owners.length ? true : false;
  });
}

function matches(pattern: string, path: string): boolean {
  return matchesGlob(pattern, path, {
    unanchoredWithoutSlash: true,
    matchDirectoryDescendants: true,
  });
}

function isOwner(value: string): boolean {
  return /^@\S+$/.test(value) || /^[^\s@]+@[^\s@]+$/.test(value);
}
