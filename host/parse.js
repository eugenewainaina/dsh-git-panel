/**
 * Pure parsers for the git command output this plugin reads.
 *
 * Everything here is synchronous and free of Node APIs so the fixtures in
 * test/parse.test.js can exercise the exact framing used by git.js.
 */

/**
 * Split a fixed-prefix record while keeping spaces in the final field.
 * @param {string} value
 * @param {number} fields
 * @returns {string[] | null}
 */
function splitFixed(value, fields) {
  const out = [];
  let start = 0;
  for (let index = 0; index < fields - 1; index += 1) {
    const space = value.indexOf(' ', start);
    if (space < 0) return null;
    out.push(value.slice(start, space));
    start = space + 1;
  }
  out.push(value.slice(start));
  return out;
}

/**
 * Push the index and worktree halves of a porcelain-v2 XY pair.
 * @param {Array<object>} entries
 * @param {string} xy
 * @param {string} path
 * @param {string | undefined} oldPath
 */
function pushXY(entries, xy, path, oldPath) {
  const indexState = xy[0];
  const worktreeState = xy[1];
  if (indexState !== undefined && indexState !== '.') {
    entries.push({ path, oldPath, status: indexState, group: 'staged' });
  }
  if (worktreeState !== undefined && worktreeState !== '.') {
    entries.push({ path, oldPath, status: worktreeState, group: 'unstaged' });
  }
}

/**
 * Parse `git status --porcelain=v2 --branch -z`.
 * @param {string} raw
 * @returns {{ branch: string | null, oid: string | null, detached: boolean, upstream: string | null, ahead: number, behind: number, entries: Array<object> }}
 */
export function parseStatus(raw) {
  const parts = String(raw ?? '').split('\0');
  let branch = null;
  let oid = null;
  let detached = false;
  let upstream = null;
  let ahead = 0;
  let behind = 0;
  const entries = [];

  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (!record) continue;

    if (record.startsWith('# ')) {
      if (record.startsWith('# branch.oid ')) {
        const value = record.slice('# branch.oid '.length).trim();
        oid = value === '(initial)' ? null : value;
      } else if (record.startsWith('# branch.head ')) {
        const value = record.slice('# branch.head '.length).trim();
        detached = value === '(detached)' || value === '';
        branch = detached ? null : value;
      } else if (record.startsWith('# branch.upstream ')) {
        const value = record.slice('# branch.upstream '.length).trim();
        upstream = value === '' ? null : value;
      } else if (record.startsWith('# branch.ab ')) {
        const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record.trim());
        if (match) {
          ahead = Number(match[1]);
          behind = Number(match[2]);
        }
      }
      continue;
    }

    switch (record[0]) {
      case '1': {
        const fields = splitFixed(record, 9);
        if (fields) pushXY(entries, fields[1], fields[8]);
        break;
      }
      case '2': {
        const fields = splitFixed(record, 10);
        if (!fields) break;
        const oldPath = parts[index + 1] ?? '';
        index += 1;
        pushXY(entries, fields[1], fields[9], oldPath);
        break;
      }
      case 'u': {
        const fields = splitFixed(record, 11);
        if (fields) entries.push({ path: fields[10], status: 'U', group: 'conflict' });
        break;
      }
      case '?': {
        entries.push({ path: record.slice(2), status: '?', group: 'untracked' });
        break;
      }
      case '!':
        break;
      default:
        break;
    }
  }

  return { branch, oid, detached, upstream, ahead, behind, entries };
}

/**
 * Parse `git diff --numstat -z` or `git diff --cached --numstat -z`.
 * Rename records carry an empty path field followed by the old and new paths.
 * @param {string} raw
 * @returns {Map<string, { path: string, oldPath?: string, additions?: number, deletions?: number, binary: boolean }>}
 */
export function parseNumstat(raw) {
  const parts = String(raw ?? '').split('\0');
  const stats = new Map();

  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (!record) continue;
    const firstTab = record.indexOf('\t');
    if (firstTab < 0) continue;
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (secondTab < 0) continue;

    const additionsRaw = record.slice(0, firstTab);
    const deletionsRaw = record.slice(firstTab + 1, secondTab);
    let path = record.slice(secondTab + 1);
    let oldPath;

    if (path === '') {
      oldPath = parts[index + 1] ?? '';
      index += 1;
      path = parts[index + 1] ?? '';
      index += 1;
    }
    if (!path) continue;

    const binary = additionsRaw === '-' || deletionsRaw === '-';
    stats.set(path, {
      path,
      oldPath,
      binary,
      additions: binary ? undefined : Number(additionsRaw),
      deletions: binary ? undefined : Number(deletionsRaw),
    });
  }

  return stats;
}

/**
 * Normalize a `%D` decoration list into display refs.
 * @param {string} raw
 * @returns {Array<{ name: string, kind: 'head' | 'local' | 'remote' | 'tag' }>}
 */
function parseRefs(raw) {
  const refs = [];
  const seen = new Set();
  const add = (name, kind) => {
    if (!name) return;
    const key = `${kind}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ name, kind });
  };

  for (const partRaw of String(raw ?? '').split(', ')) {
    const part = partRaw.trim();
    if (!part) continue;
    if (part.startsWith('HEAD -> ')) {
      add(part.slice('HEAD -> '.length).replace(/^refs\/(?:heads|remotes|tags)\//, ''), 'head');
    } else if (part === 'HEAD') {
      add('HEAD', 'head');
    } else if (part.startsWith('tag: ')) {
      add(part.slice('tag: '.length).replace(/^refs\/tags\//, ''), 'tag');
    } else if (part.startsWith('refs/heads/')) {
      add(part.slice('refs/heads/'.length), 'local');
    } else if (part.startsWith('refs/remotes/')) {
      add(part.slice('refs/remotes/'.length), 'remote');
    } else if (part.startsWith('refs/tags/')) {
      add(part.slice('refs/tags/'.length), 'tag');
    } else {
      add(part, 'local');
    }
  }

  const heads = new Set(refs.filter((ref) => ref.kind === 'head').map((ref) => ref.name));
  return refs.filter((ref) => !(ref.kind === 'local' && heads.has(ref.name)));
}

/**
 * Parse the NUL-terminated, 0x1F-separated `git log` output.
 * @param {string} raw
 * @returns {Array<{ sha: string, parents: string[], author: string, authorTime: number, subject: string, refs: Array<object> }>}
 */
export function parseLog(raw) {
  const commits = [];
  for (const record of String(raw ?? '').split('\0')) {
    if (!record) continue;
    const fields = record.split('\x1f');
    if (fields.length < 6) continue;
    const [sha, parentsRaw, author, timeRaw, subject, decorations] = fields;
    if (!/^[0-9a-f]{4,64}$/i.test(sha)) continue;
    commits.push({
      sha,
      parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
      author: author || '',
      authorTime: Number(timeRaw) || 0,
      subject: subject || '',
      refs: parseRefs(decorations),
    });
  }
  return commits;
}

/**
 * Parse `git log -1 --pretty=format:%H%x1f%s%x1f%at`.
 * @param {string} raw
 * @returns {{ sha: string, subject: string, authorTime: number } | null}
 */
export function parseHeadCommit(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const fields = text.split('\x1f');
  if (fields.length < 3) return null;
  return {
    sha: fields[0],
    subject: fields[1] || '',
    authorTime: Number(String(fields[2]).trim()) || 0,
  };
}

/**
 * Parse `git rev-list --parents -n 1 <sha>`.
 * @param {string} raw
 * @returns {{ sha: string, parents: string[] }}
 */
export function parseParents(raw) {
  const line = String(raw ?? '').trim().split('\n')[0] || '';
  const fields = line.split(' ').filter(Boolean);
  return { sha: fields[0] ?? '', parents: fields.slice(1) };
}

/**
 * Parse a commit's `diff-tree -M --name-status -z` and `--numstat -z` pair.
 * @param {string} nameStatusRaw
 * @param {string} numstatRaw
 * @returns {Array<{ path: string, oldPath?: string, status: string, additions?: number, deletions?: number, binary: boolean }>}
 */
export function parseDiffTree(nameStatusRaw, numstatRaw) {
  const parts = String(nameStatusRaw ?? '').split('\0');
  const files = [];

  for (let index = 0; index < parts.length; index += 1) {
    const status = parts[index];
    if (!status) continue;
    const letter = status[0];
    let oldPath;
    let path;
    if (letter === 'R' || letter === 'C') {
      oldPath = parts[index + 1] ?? '';
      index += 1;
      path = parts[index + 1] ?? '';
      index += 1;
    } else {
      path = parts[index + 1] ?? '';
      index += 1;
    }
    if (!path) continue;
    files.push({ path, oldPath, status: letter, binary: false });
  }

  const stats = parseNumstat(numstatRaw);
  for (const file of files) {
    const stat = stats.get(file.path);
    if (!stat) continue;
    if (stat.binary) file.binary = true;
    else {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}
