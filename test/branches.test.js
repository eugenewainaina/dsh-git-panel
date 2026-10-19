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

test('branches list, switch, create, and tags', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-branches-'));
  const repo = path.join(root, 'repo');
  try {
    await fs.mkdir(repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { env: ENV });
    git(repo, ['config', 'user.email', 'panel@example.com']);
    git(repo, ['config', 'user.name', 'Panel Tester']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    await fs.writeFile(path.join(repo, 'a.txt'), 'one\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'init']);
    git(repo, ['tag', 'v1']);

    const reader = createReader();
    let list = await reader.branches(repo);
    assert.equal(list.current, 'main');
    assert.deepEqual(list.branches.map((branch) => branch.name), ['main']);
    assert.equal(list.branches[0].current, true);

    await reader.switchBranch(repo, { name: 'feature', create: true });
    list = await reader.branches(repo, { fresh: true });
    assert.equal(list.current, 'feature');
    assert.ok(list.branches.some((branch) => branch.name === 'feature' && branch.current));

    await reader.switchBranch(repo, { name: 'main' });
    list = await reader.branches(repo, { fresh: true });
    assert.equal(list.current, 'main');

    await assert.rejects(
      () => reader.switchBranch(repo, { name: 'bad branch name', create: true }),
      (error) => error.code === 'bad-request',
    );

    let tags = await reader.tags(repo);
    assert.deepEqual(tags.tags.map((tag) => tag.name), ['v1']);
    await reader.createTag(repo, { name: 'v2' });
    tags = await reader.tags(repo, { fresh: true });
    assert.ok(tags.tags.some((tag) => tag.name === 'v2'));
    await reader.deleteTag(repo, { name: 'v2' });
    tags = await reader.tags(repo, { fresh: true });
    assert.ok(!tags.tags.some((tag) => tag.name === 'v2'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
