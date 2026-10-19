import assert from 'node:assert/strict';
import test from 'node:test';
import { createDispatcher } from '../host/rpc.js';

const REPO = '/tmp/example-repo';

function fakeReader(overrides = {}) {
  return {
    discover: async (dir, options) => ({ dir, repos: [], truncated: false, fresh: options.fresh }),
    summary: async (repo) => ({ repo }),
    repo: async (repo) => ({ summary: { repo }, changes: [], commits: [] }),
    commit: async (repo, sha) => ({ repo, sha, files: [] }),
    ...overrides,
  };
}

test('dispatches valid calls with fresh', async () => {
  const dispatch = createDispatcher(fakeReader());
  const result = await dispatch('discover', { dir: REPO, fresh: true });
  assert.deepEqual(result, {
    ok: true,
    value: { dir: REPO, repos: [], truncated: false, fresh: true },
  });
});

test('rejects relative and malformed paths', async () => {
  const dispatch = createDispatcher(fakeReader());
  for (const payload of [{ dir: 'relative' }, { dir: '/tmp/a\0b' }, { dir: 42 }, {}]) {
    const result = await dispatch('discover', payload);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'bad-request');
  }
});

test('rejects a non-hex commit id', async () => {
  const dispatch = createDispatcher(fakeReader());
  const result = await dispatch('commit', { repo: REPO, sha: 'not-a-sha' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'bad-request');
});

test('maps reader failures to the business envelope', async () => {
  const dispatch = createDispatcher(
    fakeReader({
      summary: async () => {
        const error = new Error('Not a repository');
        error.code = 'not-a-repo';
        error.details = { repo: REPO };
        throw error;
      },
    }),
  );
  const result = await dispatch('summary', { repo: REPO });
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'not-a-repo', message: 'Not a repository', details: { repo: REPO } },
  });
});

test('dispatches a diff request and rejects an unknown group', async () => {
  const dispatch = createDispatcher(
    fakeReader({
      diff: async (repo, request) => ({
        repo,
        path: request.path,
        group: request.group,
        patch: '+line',
      }),
    }),
  );
  const ok = await dispatch('diff', { repo: REPO, path: 'a.txt', group: 'unstaged' });
  assert.deepEqual(ok, {
    ok: true,
    value: { repo: REPO, path: 'a.txt', group: 'unstaged', patch: '+line' },
  });

  const bad = await dispatch('diff', { repo: REPO, path: 'a.txt', group: 'nope' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'bad-request');
});

test('unknown endpoints are a bad request', async () => {
  const dispatch = createDispatcher(fakeReader());
  const result = await dispatch('wat', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'bad-request');
});
