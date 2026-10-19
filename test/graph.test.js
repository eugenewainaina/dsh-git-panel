import assert from 'node:assert/strict';
import test from 'node:test';

const React = {
  Component: class {},
  createElement() {},
  Fragment: {},
  useEffect() {},
  useMemo() {},
  useRef() {},
  useState() {},
};

let captured;
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition;
    },
  },
};

await import('../client.js');

assert.equal(captured.id, '@local/dsh-git-panel');
const plugin = captured.factory(() => React);
const layoutGraph = plugin.__test.layoutGraph;

const commit = (sha, ...parents) => ({ sha, parents });

test('linear history stays in one lane', () => {
  const { rows, maxLanes } = layoutGraph([
    commit('c', 'b'),
    commit('b', 'a'),
    commit('a'),
  ]);
  assert.equal(maxLanes, 1);
  assert.deepEqual(rows.map((row) => row.lane), [0, 0, 0]);
  assert.deepEqual(rows[0].parents, [{ sha: 'b', lane: 0 }]);
});

test('independent tips take separate lanes and merge back', () => {
  const { rows, maxLanes } = layoutGraph([
    commit('a', 'c'),
    commit('b', 'c'),
    commit('c'),
  ]);
  assert.equal(maxLanes, 2);
  assert.deepEqual(rows.map((row) => row.lane), [0, 1, 0]);
  assert.deepEqual(rows[1].parents, [{ sha: 'c', lane: 0 }]);
});

test('a merge joins the second parent lane', () => {
  const { rows, maxLanes } = layoutGraph([
    commit('m', 'a', 'b'),
    commit('a', 'c'),
    commit('b', 'c'),
    commit('c'),
  ]);
  assert.equal(maxLanes, 2);
  assert.deepEqual(rows[0].parents, [
    { sha: 'a', lane: 0 },
    { sha: 'b', lane: 1 },
  ]);
  assert.deepEqual(rows[2].parents, [{ sha: 'c', lane: 0 }]);
  assert.deepEqual(rows[3].lane, 0);
});

test('octopus merges allocate each extra parent a lane', () => {
  const { rows, maxLanes } = layoutGraph([
    commit('m', 'a', 'b', 'd'),
    commit('a', 'c'),
    commit('b', 'c'),
    commit('d', 'c'),
    commit('c'),
  ]);
  assert.equal(maxLanes, 3);
  assert.deepEqual(rows[0].parents.map((parent) => parent.lane), [0, 1, 2]);
});

test('disconnected roots do not collide', () => {
  const { rows, maxLanes } = layoutGraph([
    commit('x', 'a'),
    commit('y', 'b'),
    commit('a'),
    commit('b'),
  ]);
  assert.equal(maxLanes, 2);
  assert.deepEqual(rows.map((row) => row.lane), [0, 1, 0, 1]);
});

test('rows keep the commit display fields', () => {
  const { rows } = layoutGraph([
    { sha: 'c', parents: ['b'], subject: 'Subject', author: 'Ada', authorTime: 1, refs: [{ name: 'main', kind: 'head' }] },
    { sha: 'b', parents: [], subject: 'Root', author: 'Ada', authorTime: 2, refs: [] },
  ]);
  assert.equal(rows[0].subject, 'Subject');
  assert.equal(rows[0].author, 'Ada');
  assert.equal(rows[0].authorTime, 1);
  assert.deepEqual(rows[0].refs, [{ name: 'main', kind: 'head' }]);
  assert.deepEqual(rows[0].parents, [{ sha: 'b', lane: 0 }]);
});

test('150 linear commits stay in one lane', () => {
  const commits = [];
  for (let index = 149; index >= 0; index -= 1) {
    commits.push(commit('c' + index, ...(index === 0 ? [] : ['c' + (index - 1)])));
  }
  const { rows, maxLanes } = layoutGraph(commits);
  assert.equal(rows.length, 150);
  assert.equal(maxLanes, 1);
});
