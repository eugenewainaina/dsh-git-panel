import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReader } from '../host/git.js';

const ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
}

async function initRepo(dir) {
  await fs.mkdir(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: ENV });
  git(dir, ['config', 'user.email', 'panel@example.com']);
  git(dir, ['config', 'user.name', 'Panel Tester']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'tag.gpgsign', 'false']);
}

async function write(dir, name, text) {
  const target = path.join(dir, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text);
}

function hashFile(file) {
  return crypto.createHash('sha256').update(execFileSync('cat', [file])).digest('hex');
}

test('reader handles a working repo, history, commits, and conflicts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-git-'));
  const repo = path.join(root, 'repo');
  const conflict = path.join(root, 'conflict');
  const unborn = path.join(root, 'unborn');
  const worktree = path.join(root, 'wt');

  try {
    await initRepo(repo);
    await write(repo, 'a.txt', 'one\n');
    await write(repo, 'b.txt', 'bee\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'init']);

    git(repo, ['checkout', '-qb', 'side']);
    await write(repo, 'c.txt', 'side\n');
    git(repo, ['add', 'c.txt']);
    git(repo, ['commit', '-qm', 'side']);

    git(repo, ['checkout', '-q', 'main']);
    await write(repo, 'd.txt', 'main\n');
    git(repo, ['add', 'd.txt']);
    git(repo, ['commit', '-qm', 'main']);
    git(repo, ['merge', '--no-ff', '-qm', 'merge side', 'side']);
    const mergeSha = git(repo, ['rev-parse', 'HEAD']).trim();

    git(repo, ['mv', 'b.txt', 'renamed.txt']);
    git(repo, ['commit', '-qm', 'rename']);
    const headSha = git(repo, ['rev-parse', 'HEAD']).trim();

    await fs.appendFile(path.join(repo, 'a.txt'), 'changed\n');
    await write(repo, 'notes.txt', 'untracked\n');

    await initRepo(conflict);
    await write(conflict, 'x.txt', 'base\n');
    git(conflict, ['add', '.']);
    git(conflict, ['commit', '-qm', 'base']);
    git(conflict, ['checkout', '-qb', 'one']);
    await write(conflict, 'x.txt', 'one\n');
    git(conflict, ['commit', '-qam', 'one']);
    git(conflict, ['checkout', '-q', 'main']);
    await write(conflict, 'x.txt', 'two\n');
    git(conflict, ['commit', '-qam', 'two']);
    try {
      git(conflict, ['merge', 'one']);
    } catch {
      // The conflict is the fixture.
    }

    await initRepo(unborn);

    const worktreeSource = path.join(root, 'wt-source');
    await initRepo(worktreeSource);
    await write(worktreeSource, 'w.txt', 'w\n');
    git(worktreeSource, ['add', '.']);
    git(worktreeSource, ['commit', '-qm', 'w']);
    git(worktreeSource, ['worktree', 'add', '-q', worktree, '-b', 'wtbranch']);

    const reader = createReader();

    const discovered = await reader.discover(root);
    const names = discovered.repos.map((entry) => entry.name).sort();
    assert.deepEqual(names, ['conflict', 'repo', 'unborn', 'wt', 'wt-source']);

    const direct = await reader.discover(repo);
    assert.equal(direct.repos.length, 1);
    assert.equal(direct.repos[0].path, await fs.realpath(repo));

    const indexFile = path.join(repo, '.git', 'index');
    const indexBefore = hashFile(indexFile);
    const detail = await reader.repo(repo);
    const indexAfter = hashFile(indexFile);
    assert.equal(indexAfter, indexBefore, 'reading the repository must not rewrite the index');

    assert.equal(detail.summary.branch, 'main');
    assert.equal(detail.summary.detached, false);
    assert.equal(detail.summary.counts.staged, 0);
    assert.equal(detail.summary.counts.unstaged, 1);
    assert.equal(detail.summary.counts.untracked, 1);
    assert.equal(detail.summary.changedFiles, 2);
    assert.equal(detail.headCommit.sha, headSha);
    assert.equal(detail.headCommit.subject, 'rename');
    assert.ok(detail.commits.length >= 5);
    assert.equal(detail.commits[0].sha, headSha);
    assert.ok(detail.commits.some((commit) => commit.parents.length === 2));
    assert.equal(detail.commitsTruncated, false);

    const renameFiles = await reader.commit(repo, headSha);
    assert.deepEqual(
      renameFiles.files.map((file) => [file.status, file.path, file.oldPath]),
      [['R', 'renamed.txt', 'b.txt']],
    );

    const mergeFiles = await reader.commit(repo, mergeSha);
    assert.ok(mergeFiles.files.some((file) => file.path === 'c.txt' && file.status === 'A'));

    const conflicted = await reader.repo(conflict);
    assert.equal(conflicted.summary.counts.conflicts, 1);
    assert.ok(conflicted.changes.some((change) => change.group === 'conflict'));

    const empty = await reader.repo(unborn);
    assert.equal(empty.summary.oid, null);
    assert.deepEqual(empty.commits, []);
    assert.equal(empty.headCommit, null);

    const summary = await reader.summary(repo);
    assert.equal(summary.repo, await fs.realpath(repo));
    assert.equal(summary.counts.unstaged, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
