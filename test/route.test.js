import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createRouteHandler } from '../host/route.js';

function request(payload, { method = 'POST', url = '/git-panel/discover' } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
  return req;
}

function response() {
  return {
    status: 0,
    headers: undefined,
    body: '',
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) {
      this.body = body || '';
      this.writableEnded = true;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function envelope(overrides = {}) {
  return {
    type: 'client-request',
    rpcId: 'rpc-1',
    method: 'discover',
    payload: { dir: '/tmp/example' },
    ...overrides,
  };
}

test('route authenticates, dispatches, and returns the rpc envelope', async () => {
  const calls = [];
  const handler = createRouteHandler({
    prefix: '/git-panel',
    dispatch: async (endpoint, payload) => {
      calls.push([endpoint, payload]);
      return { ok: true, value: { dir: payload.dir, repos: [] } };
    },
    requestRejection: () => undefined,
  });

  const res = response();
  await handler(request(envelope()), res);

  assert.equal(res.status, 200);
  assert.deepEqual(calls, [['discover', { dir: '/tmp/example' }]]);
  assert.deepEqual(JSON.parse(res.body), {
    type: 'server-response',
    rpcId: 'rpc-1',
    result: { ok: true, value: { dir: '/tmp/example', repos: [] } },
  });
});

test('route surfaces an authentication rejection', async () => {
  const handler = createRouteHandler({
    prefix: '/git-panel',
    dispatch: async () => ({ ok: true, value: {} }),
    requestRejection: () => 401,
  });
  const res = response();
  await handler(request(envelope()), res);
  assert.equal(res.status, 401);
  assert.equal(res.body, 'unauthorized');
});

test('route rejects non-POST and mismatched methods', async () => {
  const handler = createRouteHandler({
    prefix: '/git-panel',
    dispatch: async () => ({ ok: true, value: {} }),
    requestRejection: () => undefined,
  });

  const get = response();
  await handler(request(envelope(), { method: 'GET' }), get);
  assert.equal(get.status, 405);

  const mismatch = response();
  await handler(
    request(envelope({ method: 'summary' })),
    mismatch,
  );
  assert.equal(mismatch.status, 400);
});

test('route rejects an invalid endpoint', async () => {
  const handler = createRouteHandler({
    prefix: '/git-panel',
    dispatch: async () => ({ ok: true, value: {} }),
    requestRejection: () => undefined,
  });
  const res = response();
  await handler(request(envelope(), { url: '/git-panel/a/b' }), res);
  assert.equal(res.status, 404);
});
