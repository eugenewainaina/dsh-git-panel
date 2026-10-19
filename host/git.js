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
} from './parse.js';
import { scanRepos } from './discover.js';
import { abortError, createCache, createLimiter } from './cache.js';

const SHA = /^[0-9a-f]{4,64}$/i;
const LOG_PRETTY = '--pretty=format:%H%x1f%P%x1f%an%x1f%at%x1f%s%x1f%D';
const HEAD_PRETTY = '--pretty=format:%H%x1f%s%x1f%at';

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
  function execute(args, signal) {
    return new Promise((resolve, reject) => {
      try {
        execFile(
          'git',
          args,
          { encoding: 'utf8', timeout: timeoutMs, maxBuffer, signal, env, windowsHide: true },
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
  function git(repo, args, signal) {
    return limiter(
      () => execute(['-C', repo, '-c', 'core.fsmonitor=false', ...args], signal),
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

  return { discover, summary, repo: repoDetail, commit };
}
