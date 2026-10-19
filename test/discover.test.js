import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanRepos } from '../host/discover.js';

test('scanRepos finds depth-one repositories and skips noise', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgp-discover-'));
  try {
    const make = async (name, marker = 'dir') => {
      const dir = path.join(root, name);
      await fs.mkdir(dir, { recursive: true });
      if (marker === 'dir') await fs.mkdir(path.join(dir, '.git'));
      if (marker === 'file') await fs.writeFile(path.join(dir, '.git'), 'gitdir: elsewhere\n');
      return dir;
    };

    await make('alpha');
    await make('beta', 'file');
    await make('plain', 'none');
    await make('.hidden');
    await make('node_modules');
    await fs.mkdir(path.join(root, 'nested', 'deep', '.git'), { recursive: true });
    await fs.symlink(path.join(root, 'alpha'), path.join(root, 'link-to-alpha'));

    const { repos, truncated } = await scanRepos(root);
    assert.deepEqual(repos.map((repo) => path.basename(repo)), ['alpha', 'beta']);
    assert.equal(truncated, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
