import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDiffTree,
  parseHeadCommit,
  parseLog,
  parseNumstat,
  parseParents,
  parseStatus,
} from '../host/parse.js';

const OID = '80d1817bbdc527e7b91d8796a2c0b17060fe6372';

test('parseStatus reads branch headers and grouped entries', () => {
  const raw = [
    `# branch.oid ${OID}`,
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +8 -0',
    '1 .M N... 100644 100644 100644 aaaa bbbb .DS_Store',
    '1 MM N... 100644 100644 100644 cccc dddd src/file.ts',
    '2 R. N... 100644 100644 100644 eeee ffff R100 renamed.txt',
    'b.txt',
    'u AA N... 000000 100644 100644 100644 0000 1111 2222 conflict.txt',
    '? notes.md',
    '! ignored.txt',
  ].join('\0');

  const parsed = parseStatus(raw);
  assert.equal(parsed.branch, 'main');
  assert.equal(parsed.oid, OID);
  assert.equal(parsed.detached, false);
  assert.equal(parsed.upstream, 'origin/main');
  assert.equal(parsed.ahead, 8);
  assert.equal(parsed.behind, 0);

  assert.deepEqual(
    parsed.entries.map((entry) => [entry.group, entry.status, entry.path, entry.oldPath]),
    [
      ['unstaged', 'M', '.DS_Store', undefined],
      ['staged', 'M', 'src/file.ts', undefined],
      ['unstaged', 'M', 'src/file.ts', undefined],
      ['staged', 'R', 'renamed.txt', 'b.txt'],
      ['conflict', 'U', 'conflict.txt', undefined],
      ['untracked', '?', 'notes.md', undefined],
    ],
  );
});

test('parseStatus handles unborn and detached branches', () => {
  const unborn = parseStatus(['# branch.oid (initial)', '# branch.head main'].join('\0'));
  assert.equal(unborn.oid, null);
  assert.equal(unborn.branch, 'main');

  const detached = parseStatus([`# branch.oid ${OID}`, '# branch.head (detached)'].join('\0'));
  assert.equal(detached.detached, true);
  assert.equal(detached.branch, null);
  assert.equal(detached.upstream, null);
});

test('parseNumstat reads binary and rename records', () => {
  const raw = [
    '-\t-\t.DS_Store',
    '31\t8\ta.ts',
    '0\t0\t',
    'b.txt',
    'renamed.txt',
    '',
  ].join('\0');

  const stats = parseNumstat(raw);
  assert.equal(stats.get('.DS_Store').binary, true);
  assert.deepEqual(stats.get('a.ts'), {
    path: 'a.ts',
    oldPath: undefined,
    binary: false,
    additions: 31,
    deletions: 8,
  });
  assert.deepEqual(stats.get('renamed.txt'), {
    path: 'renamed.txt',
    oldPath: 'b.txt',
    binary: false,
    additions: 0,
    deletions: 0,
  });
});

test('parseLog reads NUL-terminated records and decorations', () => {
  const raw = [
    [`${OID}\x1fparent1 parent2\x1fAda\x1f1700000000\x1fSubject one\x1fHEAD -> refs/heads/main, refs/remotes/origin/main`],
    [`${'a'.repeat(40)}\x1f\x1fBob\x1f1699999999\x1fSubject two\x1frefs/tags/v1`],
  ].join('\0') + '\0';

  const commits = parseLog(raw);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].parents, ['parent1', 'parent2']);
  assert.equal(commits[0].author, 'Ada');
  assert.equal(commits[0].authorTime, 1700000000);
  assert.deepEqual(commits[0].refs, [
    { name: 'main', kind: 'head' },
    { name: 'origin/main', kind: 'remote' },
  ]);
  assert.deepEqual(commits[1].refs, [{ name: 'v1', kind: 'tag' }]);
});

test('parseHeadCommit trims the trailing newline', () => {
  const raw = `${OID}\x1fLatest subject\x1f1700000000\n`;
  assert.deepEqual(parseHeadCommit(raw), {
    sha: OID,
    subject: 'Latest subject',
    authorTime: 1700000000,
  });
  assert.equal(parseHeadCommit(''), null);
});

test('parseParents reads a rev-list line', () => {
  assert.deepEqual(parseParents(`${OID} p1 p2\n`), { sha: OID, parents: ['p1', 'p2'] });
  assert.deepEqual(parseParents(`${OID}\n`), { sha: OID, parents: [] });
});

test('parseDiffTree combines name-status and numstat', () => {
  const nameStatus = ['A', 'a.txt', 'M', 'b.txt', 'R100', 'old.txt', 'new.txt', ''].join('\0');
  const numstat = ['1\t0\ta.txt', '2\t3\tb.txt', '0\t0\t', 'old.txt', 'new.txt', ''].join('\0');

  const files = parseDiffTree(nameStatus, numstat);
  assert.deepEqual(
    files.map((file) => [file.status, file.path, file.oldPath, file.additions, file.deletions]),
    [
      ['A', 'a.txt', undefined, 1, 0],
      ['M', 'b.txt', undefined, 2, 3],
      ['R', 'new.txt', 'old.txt', 0, 0],
    ],
  );
});
