/** Validate RPC payloads and turn reader failures into business results. */
import path from 'node:path';

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function asAbsolutePath(value, field) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !path.isAbsolute(value)
  ) {
    const error = new Error(`${field} must be an absolute path.`);
    error.code = 'bad-request';
    error.details = { field };
    throw error;
  }
  return value;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {object} [details]
 */
function fail(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}

/**
 * @param {unknown} value
 */
function ok(value) {
  return { ok: true, value };
}

/**
 * @param {{ discover: Function, summary: Function, repo: Function, commit: Function }} reader
 * @returns {(endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<object>}
 */
export function createDispatcher(reader) {
  return async function dispatch(endpoint, payload, signal) {
    try {
      const params = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      const fresh = params.fresh === true;

      switch (endpoint) {
        case 'discover':
          return ok(
            await reader.discover(asAbsolutePath(params.dir, 'dir'), { fresh, signal }),
          );
        case 'summary':
          return ok(
            await reader.summary(asAbsolutePath(params.repo, 'repo'), { fresh, signal }),
          );
        case 'repo':
          return ok(
            await reader.repo(asAbsolutePath(params.repo, 'repo'), { fresh, signal }),
          );
        case 'commit': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.sha !== 'string' || !/^[0-9a-f]{4,64}$/i.test(params.sha)) {
            const error = new Error('sha must be a hexadecimal commit id.');
            error.code = 'bad-request';
            error.details = { field: 'sha' };
            throw error;
          }
          return ok(await reader.commit(repo, params.sha, { fresh, signal }));
        }
        case 'diff': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.path !== 'string' || params.path.length === 0 || params.path.length > 4096) {
            const error = new Error('path must be a repository-relative file path.');
            error.code = 'bad-request';
            error.details = { field: 'path' };
            throw error;
          }
          if (!['staged', 'unstaged', 'untracked', 'conflict', 'commit'].includes(params.group)) {
            const error = new Error('group must be staged, unstaged, untracked, conflict, or commit.');
            error.code = 'bad-request';
            error.details = { field: 'group' };
            throw error;
          }
          if (params.group === 'commit' && (typeof params.sha !== 'string' || !/^[0-9a-f]{4,64}$/i.test(params.sha))) {
            const error = new Error('sha must be a hexadecimal commit id for a commit diff.');
            error.code = 'bad-request';
            error.details = { field: 'sha' };
            throw error;
          }
          return ok(
            await reader.diff(repo, {
              path: params.path,
              group: params.group,
              sha: params.sha,
              ignoreWhitespace: params.ignoreWhitespace === true,
              context: typeof params.context === 'number' ? params.context : 3,
              fresh,
              signal,
            }),
          );
        }
        case 'stage':
        case 'unstage': {
          const repo = asAbsolutePath(params.repo, 'repo');
          return ok(await reader[endpoint](repo, { paths: params.paths, all: params.all === true, signal }));
        }
        case 'discard': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (!['unstaged', 'untracked'].includes(params.group)) {
            const error = new Error('group must be unstaged or untracked.');
            error.code = 'bad-request';
            error.details = { field: 'group' };
            throw error;
          }
          return ok(
            await reader.discard(repo, {
              paths: params.paths,
              group: params.group,
              signal,
            }),
          );
        }
        case 'commitStaged': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.message !== 'string') {
            const error = new Error('message must be a string.');
            error.code = 'bad-request';
            error.details = { field: 'message' };
            throw error;
          }
          return ok(
            await reader.commitStaged(repo, {
              message: params.message,
              amend: params.amend === true,
              signoff: params.signoff === true,
              signal,
            }),
          );
        }
        case 'undo': {
          const repo = asAbsolutePath(params.repo, 'repo');
          return ok(await reader.undo(repo, { signal }));
        }
        case 'blame': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.path !== 'string' || params.path.length === 0 || params.path.length > 4096) {
            const error = new Error('path must be a repository-relative file path.');
            error.code = 'bad-request';
            error.details = { field: 'path' };
            throw error;
          }
          return ok(
            await reader.blame(repo, {
              path: params.path,
              fresh: params.fresh === true,
              signal,
            }),
          );
        }
        case 'branches': {
          const repo = asAbsolutePath(params.repo, 'repo');
          return ok(await reader.branches(repo, { fresh: params.fresh === true, signal }));
        }
        case 'switchBranch': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.name !== 'string' || params.name.length === 0 || params.name.length > 255) {
            const error = new Error('name must be a branch name.');
            error.code = 'bad-request';
            error.details = { field: 'name' };
            throw error;
          }
          return ok(
            await reader.switchBranch(repo, {
              name: params.name,
              create: params.create === true,
              signal,
            }),
          );
        }
        case 'tags': {
          const repo = asAbsolutePath(params.repo, 'repo');
          return ok(await reader.tags(repo, { fresh: params.fresh === true, signal }));
        }
        case 'fileLog': {
          const repo = asAbsolutePath(params.repo, 'repo');
          if (typeof params.path !== 'string' || params.path.length === 0 || params.path.length > 4096) {
            const error = new Error('path must be a repository-relative file path.');
            error.code = 'bad-request';
            error.details = { field: 'path' };
            throw error;
          }
          return ok(
            await reader.fileLog(repo, {
              path: params.path,
              fresh: params.fresh === true,
              signal,
            }),
          );
        }
        default:
          return fail('bad-request', `Unknown endpoint: ${String(endpoint)}`);
      }
    } catch (error) {
      if (signal?.aborted || error?.code === 'aborted') return fail('aborted', 'Aborted.');
      const code = typeof error?.code === 'string' ? error.code : 'internal';
      const message =
        typeof error?.message === 'string' && error.message
          ? error.message
          : 'Git panel request failed.';
      return fail(code, message, error?.details ?? {});
    }
  };
}
