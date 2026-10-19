/**
 * Read-only git reader: command execution, caching, and the four operations
 * the RPC dispatcher exposes. Nothing here writes to a repository.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseDiffTree,
  parseHeadCommit,
  parseLog,
  parseNumstat,
  parseParents,
  parseStatus,
  parseBlame,
} from './parse.js';
import { scanRepos } from './discover.js';
import { abortError, createCache, createLimiter } from './cache.js';

const SHA = /^[0-9a-f]{4,64}$/i;
const LOG_PRETTY = '--pretty=format:%H%x1f%P%x1f%an%x1f%at%x1f%s%x1f%D';
const HEAD_PRETTY = '--pretty=format:%H%x1f%s%x1f%at';
const MAX_PATCH_CHARS = 200_000;
const MAX_UNTRACKED_BYTES = 1_000_000;
const DIFF_GROUPS = new Set(['staged', 'unstaged', 'untracked', 'conflict', 'commit']);

/**
 * @param {string} code
 * @param {string} message
 * @param {object} [details]
 * @returns {Error & { code: string, details: object }}
 */
function panelError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

/**
 * @param {NodeJS.ErrnoException & { stderr?: string | Buffer }} error
 * @param {string | Buffer | undefined} stderr
 * @returns {Error & { code: string, details: object }}
 */
function classifyExec(error, stderr) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return abortError();
  if (error?.code === 'ENOENT') {
    return panelError('git-missing', 'Git is not installed or is not on PATH.');
  }
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return panelError('too-large', 'Git produced more output than the panel can read.');
  }
  if (error?.killed || error?.code === 'ETIMEDOUT' || /timed out/i.test(error?.message ?? '')) {
    return panelError('git-timeout', 'Git took too long to respond.');
  }

  const text = String(stderr ?? error?.stderr ?? '').trim();
  if (/not a git repository/i.test(text)) {
    return panelError('not-a-repo', text.split('\n')[0] || 'Not a git repository.');
  }
  if (/dubious ownership|safe\.directory/i.test(text)) {
    return panelError('unsafe-repo', text.split('\n')[0] || 'This repository is not owned by the current user.');
  }
  const message = text.split('\n').slice(0, 2).join(' ').trim() || error?.message || 'Git command failed.';
  return panelError('git-failed', message);
}

/**
 * @param {unknown} error
 * @returns {Error & { code: string, details: object }}
 */
function classifyFs(error) {
  if (error?.code && typeof error.code === 'string' && !/^E[A-Z]+$/.test(error.code)) return error;
  if (error?.code === 'ENOENT') return panelError('not-found', 'That folder does not exist.');
  if (error?.code === 'ENOTDIR') return panelError('not-a-directory', 'That path is not a directory.');
  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return panelError('not-found', 'That folder cannot be read.');
  }
  return error;
}

/**
 * @param {string} value
 * @returns {Promise<string>}
 */
async function realDirectory(value) {
  let real;
  try {
    real = await fs.realpath(value);
  } catch (error) {
    throw classifyFs(error);
  }
  let stat;
  try {
    stat = await fs.stat(real);
  } catch (error) {
    throw classifyFs(error);
  }
  if (!stat.isDirectory()) throw panelError('not-a-directory', 'That path is not a directory.');
  return real;
}

/**
 * @typedef {object} ReaderOptions
 * @property {number} [timeoutMs]
 * @property {number} [maxBuffer]
 * @property {number} [concurrency]
 */

/**
 * @param {ReaderOptions} [options]
 */
export function createReader(options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
  const limiter = createLimiter(options.concurrency ?? 3);
  const cache = createCache();
  const inflight = new Map();
  let writeChain = Promise.resolve();

  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_COMMON_DIR',
    'GIT_NAMESPACE',
  ]) {
    delete env[key];
  }

  /**
   * @param {string[]} args
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<string>}
   */
  function execute(args, signal, timeout = timeoutMs) {
    return new Promise((resolve, reject) => {
      try {
        execFile(
          'git',
          args,
          { encoding: 'utf8', timeout, maxBuffer, signal, env, windowsHide: true },
          (error, stdout, stderr) => {
            if (error) reject(classifyExec(error, stderr));
            else resolve(stdout);
          },
        );
      } catch (error) {
        reject(classifyExec(error));
      }
    });
  }

  /**
   * @param {string} repo
   * @param {string[]} args
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<string>}
   */
  function git(repo, args, signal, timeout = timeoutMs) {
    return limiter(
      () =>
        execute(
          ['--literal-pathspecs', '-C', repo, '-c', 'core.fsmonitor=false', ...args],
          signal,
          timeout,
        ),
      signal,
    );
  }

  /**
   * TTL + in-flight dedupe.
   * @template T
   * @param {string} key
   * @param {number} ttlMs
   * @param {boolean} fresh
   * @param {() => Promise<T>} load
   * @returns {Promise<T>}
   */
  async function remember(key, ttlMs, fresh, load) {
    if (!fresh) {
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
    }
    const pending = inflight.get(key);
    if (pending) return pending;

    let promise;
    promise = (async () => {
      const value = await load();
      cache.set(key, value, ttlMs);
      return value;
    })().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  }

  /**
   * Serialize writes and invalidate the read caches once they settle.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function writeAction(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      cache.clear();
      inflight.clear();
    });
  }

  /**
   * @param {unknown} values
   * @returns {string[]}
   */
  function relativePaths(values) {
    if (!Array.isArray(values) || values.length === 0 || values.length > 200) {
      throw panelError('bad-request', 'Provide between 1 and 200 file paths.');
    }
    const paths = [];
    for (const value of values) {
      const path = relativeRepoPath(value);
      if (!paths.includes(path)) paths.push(path);
    }
    return paths;
  }

  /**
   * @param {string} dir
   * @param {AbortSignal | undefined} signal
   * @param {boolean} fresh
   * @returns {Promise<string | undefined>}
   */
  async function resolveRoot(dir, signal, fresh) {
    const real = await realDirectory(dir);
    return remember(`root:${real}`, 15_000, fresh, async () => {
      try {
        const output = await git(real, ['rev-parse', '--show-toplevel'], signal);
        const root = output.trim();
        if (!root) return undefined;
        return await realDirectory(root);
      } catch (error) {
        if (error?.code === 'not-a-repo') return undefined;
        throw error;
      }
    });
  }

  /**
   * @param {string} repo
   * @param {AbortSignal | undefined} signal
   */
  async function readStatus(repo, signal) {
    const output = await git(
      repo,
      ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'],
      signal,
    );
    return parseStatus(output);
  }

  /**
   * @param {string} repo
   * @param {boolean} cached
   * @param {AbortSignal | undefined} signal
   */
  async function readNumstat(repo, cached, signal) {
    const args = ['diff', cached ? '--cached' : null, '--numstat', '-z'].filter(Boolean);
    return parseNumstat(await git(repo, args, signal));
  }

  /**
   * @param {Array<{ group: string, path: string }>} entries
   * @param {Map<string, { additions?: number, deletions?: number, binary: boolean }>} staged
   * @param {Map<string, { additions?: number, deletions?: number, binary: boolean }>} unstaged
   */
  function applyCounts(entries, staged, unstaged) {
    for (const entry of entries) {
      const stats = entry.group === 'staged' ? staged : entry.group === 'unstaged' ? unstaged : undefined;
      if (!stats) continue;
      const stat = stats.get(entry.path);
      if (!stat) continue;
      if (stat.binary) entry.binary = true;
      else {
        entry.additions = stat.additions;
        entry.deletions = stat.deletions;
      }
    }
  }

  /**
   * @param {ReturnType<typeof parseStatus>} parsed
   * @param {Array<object>} entries
   * @param {boolean} truncated
   * @returns {object}
   */
  function buildSummary(parsed, root, entries, truncated) {
    const counts = { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
    for (const entry of entries) {
      if (entry.group === 'staged') counts.staged += 1;
      else if (entry.group === 'unstaged') counts.unstaged += 1;
      else if (entry.group === 'untracked') counts.untracked += 1;
      else if (entry.group === 'conflict') counts.conflicts += 1;
    }
    return {
      repo: root,
      branch: parsed.branch,
      oid: parsed.oid,
      detached: parsed.detached,
      upstream: parsed.upstream,
      ahead: parsed.ahead,
      behind: parsed.behind,
      counts,
      changedFiles: new Set(entries.map((entry) => entry.path)).size,
      truncated,
      scannedAt: Date.now(),
    };
  }

  /**
   * @param {Array<object>} entries
   * @returns {{ entries: Array<object>, truncated: boolean }}
   */
  function capEntries(entries) {
    return {
      entries: entries.length > 1000 ? entries.slice(0, 1000) : entries,
      truncated: entries.length > 1000,
    };
  }

  /**
   * @param {string} dir
   * @param {{ fresh?: boolean, signal?: AbortSignal }} [request]
   */
  async function discover(dir, request = {}) {
    const real = await realDirectory(dir);
    const fresh = request.fresh === true;
    return remember(`discover:${real}`, 60_000, fresh, async () => {
      const root = await resolveRoot(real, request.signal, fresh);
      if (root) {
        return {
          dir: real,
          repos: [{ path: root, name: path.basename(root) || root }],
          truncated: false,
        };
      }
      try {
        const { repos, truncated } = await scanRepos(real);
        return {
          dir: real,
          repos: repos.map((repo) => ({ path: repo, name: path.basename(repo) || repo })),
          truncated,
        };
      } catch (error) {
        throw classifyFs(error);
      }
    });
  }

  /**
   * @param {string} repo
   * @param {{ fresh?: boolean, signal?: AbortSignal }} [request]
   */
  async function summary(repo, request = {}) {
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    return remember(`summary:${root}`, 2_000, fresh, async () => {
      const parsed = await readStatus(root, request.signal);
      const capped = capEntries(parsed.entries);
      return buildSummary(parsed, root, capped.entries, capped.truncated);
    });
  }

  /**
   * @param {string} repo
   * @param {{ fresh?: boolean, signal?: AbortSignal }} [request]
   */
  async function repoDetail(repo, request = {}) {
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');

    return remember(`repo:${root}`, 2_000, fresh, async () => {
      const parsed = await readStatus(root, request.signal);
      const capped = capEntries(parsed.entries);
      const [unstaged, staged] = await Promise.all([
        readNumstat(root, false, request.signal),
        readNumstat(root, true, request.signal),
      ]);

      let logOutput = null;
      let headOutput = null;
      if (parsed.oid) {
        [logOutput, headOutput] = await Promise.all([
          git(
            root,
            [
              'log',
              'HEAD',
              '--branches',
              '--tags',
              '-n',
              '151',
              '--topo-order',
              '--decorate=full',
              '-z',
              LOG_PRETTY,
            ],
            request.signal,
          ),
          git(root, ['log', '-1', HEAD_PRETTY, 'HEAD'], request.signal),
        ]);
      }

      applyCounts(capped.entries, staged, unstaged);
      let commits = logOutput ? parseLog(logOutput) : [];
      const commitsTruncated = commits.length > 150;
      if (commitsTruncated) commits = commits.slice(0, 150);

      return {
        summary: buildSummary(parsed, root, capped.entries, capped.truncated),
        headCommit: headOutput ? parseHeadCommit(headOutput) : null,
        changes: capped.entries,
        commits,
        commitsTruncated,
      };
    });
  }

  /**
   * @param {string} repo
   * @param {string} sha
   * @param {{ fresh?: boolean, signal?: AbortSignal }} [request]
   */
  async function commit(repo, sha, request = {}) {
    if (!SHA.test(sha)) throw panelError('bad-request', 'Invalid commit id.');
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');

    return remember(`commit:${root}:${sha}`, 60_000, fresh, async () => {
      const parentsOutput = await git(root, ['rev-list', '--parents', '-n', '1', sha], request.signal);
      const { parents } = parseParents(parentsOutput);
      const base = ['diff-tree', '-r', '-M', '--no-commit-id'];
      if (parents.length === 0) base.push('--root');
      const range = parents.length === 0 ? [sha] : [`${sha}^1`, sha];
      const [nameStatus, numstat] = await Promise.all([
        git(root, [...base, '--name-status', '-z', ...range], request.signal),
        git(root, [...base, '--numstat', '-z', ...range], request.signal),
      ]);
      return { sha, files: parseDiffTree(nameStatus, numstat) };
    });
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function relativeRepoPath(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.includes('\0')) {
      throw panelError('bad-request', 'Invalid file path.');
    }
    const normalized = value.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    if (
      normalized.length === 0 ||
      normalized === '.' ||
      normalized.startsWith('/') ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.split('/').some((segment) => segment === '' || segment === '..')
    ) {
      throw panelError('bad-request', 'Invalid file path.');
    }
    return normalized;
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function quoteGitPath(value) {
    if (!/[\s"\\]/.test(value)) return value;
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  /**
   * @param {string} value
   * @returns {{ patch: string, truncated: boolean }}
   */
  function truncatePatch(value) {
    if (value.length <= MAX_PATCH_CHARS) return { patch: value, truncated: false };
    return { patch: value.slice(0, MAX_PATCH_CHARS), truncated: true };
  }

  /**
   * Render an untracked file as an added file. Git is not asked to diff an
   * untracked file, so the patch is synthesized here and capped.
   * @param {string} root
   * @param {string} rel
   * @param {AbortSignal | undefined} signal
   */
  async function readUntracked(root, rel, signal) {
    if (signal?.aborted) throw abortError();
    let realRoot;
    try {
      realRoot = await fs.realpath(root);
    } catch (error) {
      throw classifyFs(error);
    }
    const absolute = path.resolve(realRoot, rel);
    let realFile;
    try {
      realFile = await fs.realpath(absolute);
    } catch (error) {
      throw classifyFs(error);
    }
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
      throw panelError('path-outside-repo', 'That file is outside the repository.');
    }
    let stat;
    try {
      stat = await fs.stat(realFile);
    } catch (error) {
      throw classifyFs(error);
    }
    if (!stat.isFile()) throw panelError('bad-request', 'That path is not a file.');
    if (stat.size > MAX_UNTRACKED_BYTES) {
      throw panelError('too-large', 'That file is too large to diff here.');
    }
    let buffer;
    try {
      buffer = await fs.readFile(realFile);
    } catch (error) {
      throw classifyFs(error);
    }
    if (buffer.includes(0)) return { patch: '', binary: true, truncated: false };

    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const label = quoteGitPath(rel);
    const count = lines.length;
    let patch =
      `diff --git a/${label} b/${label}\n` +
      'new file mode 100644\n' +
      '--- /dev/null\n' +
      `+++ b/${label}\n` +
      `@@ -0,0 +${count === 0 ? '0' : '1'},${count} @@\n`;
    if (count > 0) {
      patch += lines.map((line) => '+' + line).join('\n');
      patch += text.endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n';
    }
    return { ...truncatePatch(patch), binary: false };
  }

  /**
   * @param {string} repo
   * @param {{ path?: string, group?: string, sha?: string, fresh?: boolean, signal?: AbortSignal }} request
   */
  async function diff(repo, request = {}) {
    const group = request.group;
    if (!DIFF_GROUPS.has(group)) throw panelError('bad-request', 'Invalid diff group.');
    const rel = relativeRepoPath(request.path);
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    if (group === 'commit' && !SHA.test(request.sha ?? '')) {
      throw panelError('bad-request', 'Invalid commit id.');
    }
    const ignoreWhitespace = request.ignoreWhitespace === true;
    const context = Math.min(10, Math.max(0, Number(request.context) || 3));
    const unified = `--unified=${context}`;

    const key = `diff:${root}:${group}:${group === 'commit' ? request.sha : ''}:${rel}:${ignoreWhitespace ? 'w' : '-'}:${context}`;
    const ttl = group === 'commit' ? 60_000 : 2_000;
    return remember(key, ttl, fresh, async () => {
      if (group === 'untracked') {
        return {
          path: rel,
          group,
          sha: null,
          ...(await readUntracked(root, rel, request.signal)),
        };
      }

      let args;
      if (group === 'commit') {
        const parentsOutput = await git(
          root,
          ['rev-list', '--parents', '-n', '1', request.sha],
          request.signal,
        );
        const { parents } = parseParents(parentsOutput);
        args =
          parents.length === 0
            ? ['show', '--format=', '--no-color', '--no-ext-diff', unified, '-M', ...(ignoreWhitespace ? ['-w'] : []), request.sha, '--', rel]
            : ['diff', '--no-color', '--no-ext-diff', unified, '-M', ...(ignoreWhitespace ? ['-w'] : []), `${request.sha}^1`, request.sha, '--', rel];
      } else if (group === 'staged') {
        args = ['diff', '--cached', '--no-color', '--no-ext-diff', unified, '-M', ...(ignoreWhitespace ? ['-w'] : []), '--', rel];
      } else {
        args = ['diff', '--no-color', '--no-ext-diff', unified, '-M', ...(ignoreWhitespace ? ['-w'] : []), '--', rel];
      }

      const output = await git(root, args, request.signal);
      const binary = /^Binary files /m.test(output) || /^GIT binary patch/m.test(output);
      const capped = truncatePatch(output);
      return {
        path: rel,
        group,
        sha: group === 'commit' ? request.sha : null,
        patch: capped.patch,
        binary,
        truncated: capped.truncated,
      };
    });
  }

  /**
   * @param {string} repo
   * @param {{ paths?: string[], all?: boolean, signal?: AbortSignal }} request
   */
  async function stage(repo, request = {}) {
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      if (request.all === true) {
        await git(root, ['add', '-A'], request.signal);
      } else {
        const paths = relativePaths(request.paths);
        await git(root, ['add', '-A', '--', ...paths], request.signal);
      }
      return { ok: true };
    });
  }

  /**
   * @param {string} repo
   * @param {{ paths?: string[], all?: boolean, signal?: AbortSignal }} request
   */
  async function unstage(repo, request = {}) {
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      const paths = request.all === true ? null : relativePaths(request.paths);
      const range = paths === null ? ['.'] : paths;
      try {
        await git(
          root,
          ['restore', '--staged', '--', ...range],
          request.signal,
        );
      } catch (error) {
        // An unborn branch has no HEAD to restore from; drop the index entries.
        if (!/HEAD|ambiguous argument|resolve/i.test(error.message)) throw error;
        await git(
          root,
          paths === null ? ['rm', '-r', '--cached', '--', '.'] : ['rm', '--cached', '--', ...paths],
          request.signal,
        );
      }
      return { ok: true };
    });
  }

  /**
   * @param {string} repo
   * @param {{ paths?: string[], group?: string, signal?: AbortSignal }} request
   */
  async function discard(repo, request = {}) {
    return writeAction(async () => {
      const group = request.group;
      if (group !== 'unstaged' && group !== 'untracked') {
        throw panelError('bad-request', 'Discard supports unstaged and untracked changes.');
      }
      const paths = relativePaths(request.paths);
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      if (group === 'untracked') {
        await git(root, ['clean', '-f', '-d', '--', ...paths], request.signal);
      } else {
        await git(root, ['restore', '--worktree', '--', ...paths], request.signal);
      }
      return { ok: true };
    });
  }

  /**
   * @param {string} repo
   * @param {{ message?: string, amend?: boolean, signoff?: boolean, signal?: AbortSignal }} request
   */
  async function commitStaged(repo, request = {}) {
    return writeAction(async () => {
      const message = typeof request.message === 'string' ? request.message.trim() : '';
      if ((!message && request.amend !== true) || message.length > 10_000 || message.includes('\0')) {
        throw panelError('bad-request', 'A commit message is required (up to 10,000 characters).');
      }
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');

      const args = ['commit'];
      if (request.amend === true) args.push('--amend');
      if (message) args.push('-m', message);
      else args.push('--no-edit');
      if (request.signoff === true) args.push('--signoff');

      const output = await git(root, args, request.signal);
      const sha = (await git(root, ['rev-parse', 'HEAD'], request.signal)).trim();
      return { ok: true, sha, output: output.slice(0, 2000) };
    });
  }

  /**
   * @param {string} repo
   * @param {{ signal?: AbortSignal }} request
   */
  async function undoCommit(repo, request = {}) {
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      let count;
      try {
        count = Number((await git(root, ['rev-list', '--count', 'HEAD'], request.signal)).trim());
      } catch (error) {
        if (error.code === 'git-failed') throw panelError('bad-request', 'There is no commit to undo.');
        throw error;
      }
      if (!Number.isFinite(count) || count < 1) {
        throw panelError('bad-request', 'There is no commit to undo.');
      }
      if (count > 1) {
        await git(root, ['reset', '--soft', 'HEAD^'], request.signal);
      } else {
        await git(root, ['update-ref', '-d', 'HEAD'], request.signal);
      }
      return { ok: true };
    });
  }

  /**
   * @param {string} repo
   * @param {{ path?: string, fresh?: boolean, signal?: AbortSignal }} request
   */
  async function blame(repo, request = {}) {
    const rel = relativeRepoPath(request.path);
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    return remember(`blame:${root}:${rel}`, 5_000, fresh, async () => {
      const output = await git(root, ['blame', '--line-porcelain', '--', rel], request.signal);
      const lines = parseBlame(output);
      return {
        path: rel,
        lines: lines.slice(0, 5000),
        truncated: lines.length > 5000,
      };
    });
  }

  /**
   * @param {string} repo
   * @param {{ path?: string, fresh?: boolean, signal?: AbortSignal }} request
   */
  async function fileLog(repo, request = {}) {
    const rel = relativeRepoPath(request.path);
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    return remember(`filelog:${root}:${rel}`, 10_000, fresh, async () => {
      const output = await git(
        root,
        ['log', '--follow', '--max-count=100', '--decorate=full', '-z', LOG_PRETTY, '--', rel],
        request.signal,
      );
      const commits = parseLog(output);
      return {
        path: rel,
        commits: commits.slice(0, 100),
        truncated: commits.length > 100,
      };
    });
  }

  /**
   * @param {string} repo
   * @param {{ fresh?: boolean, signal?: AbortSignal }} request
   */
  async function branches(repo, request = {}) {
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    return remember(`branches:${root}`, 5_000, fresh, async () => {
      const output = await git(
        root,
        [
          'for-each-ref',
          '--format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short)',
          'refs/heads',
        ],
        request.signal,
      );
      const list = output
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, head, upstream, sha] = line.split('\t');
          return {
            name,
            current: head.trim() === '*',
            upstream: upstream || null,
            sha: sha || null,
          };
        });
      return { branches: list, current: list.find((branch) => branch.current)?.name || null };
    });
  }

  /**
   * @param {string} repo
   * @param {{ name?: string, create?: boolean, signal?: AbortSignal }} request
   */
  async function switchBranch(repo, request = {}) {
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    if (!name || name.length > 255 || name.startsWith('-')) {
      throw panelError('bad-request', 'Invalid branch name.');
    }
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      try {
        await git(root, ['check-ref-format', '--branch', name], request.signal);
      } catch {
        throw panelError('bad-request', 'Invalid branch name.');
      }
      const args = request.create === true ? ['switch', '-c', name] : ['switch', name];
      await git(root, args, request.signal);
      return { ok: true, branch: name };
    });
  }

  /**
   * @param {string} repo
   * @param {{ fresh?: boolean, signal?: AbortSignal }} request
   */
  async function tags(repo, request = {}) {
    const fresh = request.fresh === true;
    const root = await resolveRoot(repo, request.signal, fresh);
    if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
    return remember(`tags:${root}`, 5_000, fresh, async () => {
      const output = await git(
        root,
        ['tag', '--list', '--format=%(refname:short)%09%(objectname:short)'],
        request.signal,
      );
      return {
        tags: output
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [name, sha] = line.split('\t');
            return { name, sha: sha || null };
          }),
      };
    });
  }

  /**
   * @param {string} repo
   * @param {'fetch' | 'pull' | 'push'} action
   * @param {{ signal?: AbortSignal }} request
   */
  async function sync(repo, action, request = {}) {
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      let args;
      if (action === 'fetch') args = ['fetch', '--prune'];
      else if (action === 'pull') args = ['pull', '--ff-only'];
      else if (action === 'push') args = ['push'];
      else throw panelError('bad-request', 'Unknown sync action.');
      const output = await git(root, args, request.signal, 60_000);
      return { ok: true, action, output: output.slice(0, 2000) };
    });
  }

  /**
   * @param {string} repo
   * @param {{ name?: string, sha?: string, signal?: AbortSignal }} request
   */
  async function createTag(repo, request = {}) {
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    if (!name || name.length > 200 || name.startsWith('-')) {
      throw panelError('bad-request', 'Invalid tag name.');
    }
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      try {
        await git(root, ['check-ref-format', `refs/tags/${name}`], request.signal);
      } catch {
        throw panelError('bad-request', 'Invalid tag name.');
      }
      const args = ['tag', name];
      if (request.sha) args.push(request.sha);
      await git(root, args, request.signal);
      return { ok: true, name };
    });
  }

  /**
   * @param {string} repo
   * @param {{ name?: string, signal?: AbortSignal }} request
   */
  async function deleteTag(repo, request = {}) {
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    if (!name || name.length > 200 || name.startsWith('-')) {
      throw panelError('bad-request', 'Invalid tag name.');
    }
    return writeAction(async () => {
      const root = await resolveRoot(repo, request.signal, false);
      if (!root) throw panelError('not-a-repo', 'That folder is not inside a git repository.');
      await git(root, ['tag', '-d', name], request.signal);
      return { ok: true, name };
    });
  }

  return {
    discover,
    summary,
    repo: repoDetail,
    commit,
    diff,
    stage,
    unstage,
    discard,
    commitStaged,
    undo: undoCommit,
    blame,
    fileLog,
    branches,
    switchBranch,
    tags,
    createTag,
    deleteTag,
    sync,
  };
}
