export interface GlobMatchOptions {
  unanchoredWithoutSlash?: boolean;
  matchDirectoryDescendants?: boolean;
}

export function isSupportedGlob(pattern: string): boolean {
  return pattern.length > 0
    && !pattern.startsWith('!')
    && !pattern.includes('[')
    && !pattern.includes(']')
    && !pattern.includes('\\');
}

export function matchesGlob(
  pattern: string,
  path: string,
  options: GlobMatchOptions = {},
): boolean {
  if (!isSupportedGlob(pattern)) return false;

  const rootAnchored = pattern.startsWith('/');
  const directoryPattern = pattern.endsWith('/');
  const normalizedPattern = pattern.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalizedPattern.length === 0) return false;

  const unanchored = options.unanchoredWithoutSlash === true
    && !rootAnchored
    && !normalizedPattern.includes('/');
  const finalSegment = normalizedPattern.split('/').at(-1) ?? '';
  const matchDescendants = options.matchDirectoryDescendants === true
    && (directoryPattern || !/[*?]/.test(finalSegment));
  const prefix = unanchored ? '(?:^|/)' : '^';
  const suffix = matchDescendants ? '(?:/.*)?$' : '$';
  const expression = new RegExp(`${prefix}${globSource(normalizedPattern)}${suffix}`);

  return expression.test(path.replace(/^\/+/, ''));
}

function globSource(pattern: string): string {
  let source = '';

  for (let index = 0; index < pattern.length;) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      index += 2;
      while (pattern[index] === '*') index += 1;
      if (pattern[index] === '/') {
        source += '(?:[^/]+/)*';
        index += 1;
      } else {
        source += '.*';
      }
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }

    source += escapeRegExp(character);
    index += 1;
  }

  return source;
}

function escapeRegExp(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}
