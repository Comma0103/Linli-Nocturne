import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function safeRelativePath(input) {
  if (typeof input !== 'string') throw new Error('Unsafe game-relative path');
  const normalized = input.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (!normalized || /[:\x00-\x1f<>"|?*]/.test(normalized) || parts.some(part =>
    !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    throw new Error(`Unsafe game-relative path: ${input}`);
  }
  return normalized;
}

export function isWithin(root, candidate) {
  const difference = relative(resolve(root), resolve(candidate));
  return difference === '' || (!isAbsolute(difference) && difference !== '..' && !difference.startsWith('..' + sep));
}

// Resolve existing ancestors too, so junctions cannot hide a backup inside the game.
export function canonicalPath(input) {
  const absolute = resolve(input);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) throw new Error(`Path root does not exist: ${absolute}`);
  return join(canonicalPath(parent), relative(parent, absolute));
}

export function directoryRoot(input) {
  const root = realpathSync(input);
  if (!statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
  return root;
}

export function resolveUnderRoot(root, input) {
  const safePath = safeRelativePath(input);
  const base = directoryRoot(root);
  let current = base;
  const parts = safePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (info?.isSymbolicLink()) throw new Error(`Links are not allowed in patch paths: ${input}`);
    if (info && index < parts.length - 1 && !info.isDirectory()) throw new Error(`Path parent is not a directory: ${input}`);
  }
  return current;
}

export function uniquePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('A non-empty file list is required');
  const normalized = paths.map(safeRelativePath);
  if (new Set(normalized.map(path => path.toLowerCase())).size !== normalized.length) throw new Error('Duplicate file paths');
  return normalized;
}
