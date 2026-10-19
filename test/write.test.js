import assert from 'node:assert/strict';
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
}

async function write(dir, name, text) {
  await fs.writeFile(path.join(dir, name), text);
}

test('write core stages, unstages, commits, discards, and undoes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-write-'));
  const repo = path.join(root, 'repo');
  try {
    await initRepo(repo);
    await write(repo, 'a.txt', 'one\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'init']);

    const reader = createReader();

    await fs.appendFile(path.join(repo, 'a.txt'), 'two\n');
    await write(repo, 'later.txt', 'later\n');

    await reader.stage(repo, { paths: ['a.txt'] });
    let detail = await reader.repo(repo);
    assert.equal(detail.summary.counts.staged, 1);
    assert.equal(detail.summary.counts.untracked, 1);

    await reader.unstage(repo, { paths: ['a.txt'] });
    detail = await reader.repo(repo);
    assert.equal(detail.summary.counts.staged, 0);
    assert.equal(detail.summary.counts.unstaged, 1);

    await reader.stage(repo, { all: true });
    detail = await reader.repo(repo);
    assert.equal(detail.summary.counts.staged, 2);

    const committed = await reader.commitStaged(repo, { message: 'update files' });
    assert.equal(git(repo, ['log', '-1', '--format=%s']).trim(), 'update files');
    assert.equal(committed.sha, git(repo, ['rev-parse', 'HEAD']).trim());
    detail = await reader.repo(repo);
    assert.equal(detail.summary.changedFiles, 0);

    await fs.appendFile(path.join(repo, 'a.txt'), 'three\n');
    await reader.discard(repo, { paths: ['a.txt'], group: 'unstaged' });
    assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'one\ntwo\n');

    await write(repo, 'throwaway.txt', 'bye\n');
    await reader.discard(repo, { paths: ['throwaway.txt'], group: 'untracked' });
    await assert.rejects(fs.stat(path.join(repo, 'throwaway.txt')));

    await fs.appendFile(path.join(repo, 'a.txt'), 'four\n');
    await reader.stage(repo, { paths: ['a.txt'] });
    await reader.commitStaged(repo, { message: 'amend me' });
    await fs.appendFile(path.join(repo, 'a.txt'), 'five\n');
    await reader.stage(repo, { paths: ['a.txt'] });
    await reader.commitStaged(repo, { message: 'final', amend: true });
    assert.equal(git(repo, ['log', '-1', '--format=%s']).trim(), 'final');

    const beforeUndo = git(repo, ['rev-parse', 'HEAD^']).trim();
    await reader.undo(repo);
    assert.equal(git(repo, ['rev-parse', 'HEAD']).trim(), beforeUndo);
    detail = await reader.repo(repo);
    assert.ok(detail.summary.counts.staged > 0 || detail.summary.counts.unstaged > 0);

    await assert.rejects(
      () => reader.stage(repo, { paths: ['../outside.txt'] }),
      (error) => error.code === 'bad-request',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('unstage works on an unborn branch and undo removes the first commit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-write-unborn-'));
  const repo = path.join(root, 'repo');
  try {
    await initRepo(repo);
    await write(repo, 'first.txt', 'first\n');
    const reader = createReader();

    await reader.stage(repo, { paths: ['first.txt'] });
    await reader.unstage(repo, { paths: ['first.txt'] });
    let summary = await reader.summary(repo);
    assert.equal(summary.counts.staged, 0);
    assert.equal(summary.counts.untracked, 1);

    await reader.stage(repo, { all: true });
    await reader.commitStaged(repo, { message: 'first commit' });
    await reader.undo(repo);
    summary = await reader.summary(repo);
    assert.equal(summary.oid, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
