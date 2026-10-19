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

async function configure(dir) {
  git(dir, ['config', 'user.email', 'panel@example.com']);
  git(dir, ['config', 'user.name', 'Panel Tester']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

test('fetch, pull, and push use the configured upstream', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-sync-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  const other = path.join(root, 'other');
  try {
    execFileSync('git', ['init', '-q', '--bare', remote], { env: ENV });
    execFileSync('git', ['clone', '-q', remote, repo], { env: ENV });
    await configure(repo);
    await fs.writeFile(path.join(repo, 'a.txt'), 'one\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'init']);
    git(repo, ['push', '-q', '-u', 'origin', 'main']);

    const reader = createReader();

    await fs.appendFile(path.join(repo, 'a.txt'), 'two\n');
    git(repo, ['commit', '-qam', 'two']);
    await reader.sync(repo, 'push');
    assert.equal(
      execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding: 'utf8', env: ENV }).trim(),
      git(repo, ['rev-parse', 'HEAD']).trim(),
    );

    execFileSync('git', ['clone', '-q', remote, other], { env: ENV });
    await configure(other);
    await fs.writeFile(path.join(other, 'b.txt'), 'remote\n');
    git(other, ['add', '.']);
    git(other, ['commit', '-qm', 'remote change']);
    git(other, ['push', '-q', 'origin', 'main']);

    await reader.sync(repo, 'fetch');
    let summary = await reader.summary(repo, { fresh: true });
    assert.equal(summary.behind, 1);

    await reader.sync(repo, 'pull');
    assert.equal(await fs.readFile(path.join(repo, 'b.txt'), 'utf8'), 'remote\n');
    summary = await reader.summary(repo, { fresh: true });
    assert.equal(summary.behind, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
