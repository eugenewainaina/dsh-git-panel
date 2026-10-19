/**
 * Depth-one repository discovery.
 *
 * A repository is any immediate child directory that contains a `.git` entry
 * (directory, or file for a linked worktree). The picked directory itself is
 * handled by git.js through `rev-parse --show-toplevel` first.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} dir absolute directory
 * @returns {Promise<{ repos: string[], truncated: boolean }>}
 */
export async function scanRepos(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const repos = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const child = path.join(dir, entry.name);
    try {
      const stat = await fs.lstat(path.join(child, '.git'));
      if (stat.isDirectory() || stat.isFile()) repos.push(child);
    } catch {
      // No `.git` entry, or an entry this user cannot stat.
    }
  }

  repos.sort((left, right) =>
    path.basename(left).localeCompare(path.basename(right), undefined, { sensitivity: 'base' }),
  );

  return { repos: repos.slice(0, 100), truncated: repos.length > 100 };
}
