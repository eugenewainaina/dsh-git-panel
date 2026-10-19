/** HTTP bridge for the panel's Connection RPC envelope. */
const DEFAULT_LIMIT = 64 * 1024;

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function send(res, status, payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type':
      typeof payload === 'string'
        ? 'text/plain; charset=utf-8'
        : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 */
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('Request body too large.');
        error.code = 'too-large';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {object} options
 * @param {string} options.prefix
 * @param {(endpoint: string, payload: unknown, signal: AbortSignal) => Promise<object>} options.dispatch
 * @param {(request: { headers: object }) => 401 | 403 | undefined} options.requestRejection
 * @param {number} [options.maxBodyBytes]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createRouteHandler({ prefix, dispatch, requestRejection, maxBodyBytes = DEFAULT_LIMIT }) {
  const endpointPattern = /^[A-Za-z0-9_$.-]+$/;
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  return async function route(req, res) {
    try {
      if (req.method !== 'POST') {
        send(res, 405, 'method not allowed');
        return;
      }
      const rejection = requestRejection({ headers: req.headers });
      if (rejection !== undefined) {
        send(res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }

      const url = new URL(req.url || '/', 'http://localhost');
      const endpoint = url.pathname.slice(base.length + 1);
      if (!endpoint || endpoint.includes('/') || !endpointPattern.test(endpoint)) {
        send(res, 404, 'not found');
        return;
      }

      let body;
      try {
        body = await readJson(req, maxBodyBytes);
      } catch (error) {
        send(res, error?.code === 'too-large' ? 413 : 400, 'invalid request body');
        return;
      }
      if (
        !body ||
        typeof body !== 'object' ||
        body.type !== 'client-request' ||
        typeof body.rpcId !== 'string' ||
        body.method !== endpoint
      ) {
        send(res, 400, 'invalid rpc envelope');
        return;
      }

      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      req.on('close', onClose);
      let result;
      try {
        result = await dispatch(endpoint, body.payload, controller.signal);
      } finally {
        req.off('close', onClose);
      }
      send(res, 200, {
        type: 'server-response',
        rpcId: body.rpcId,
        result,
      });
    } catch {
      if (!res.headersSent) send(res, 500, 'internal error');
      else res.destroy();
    }
  };
}
