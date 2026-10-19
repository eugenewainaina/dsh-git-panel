/** Host half: serve the git reader over an authenticated Connection RPC route. */
import { createReader } from './host/git.js';
import { createDispatcher } from './host/rpc.js';
import { createRouteHandler } from './host/route.js';

export const inject = ['connection'];

const PREFIX = '/git-panel';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const reader = createReader();
  const dispatch = createDispatcher(reader);

  ctx.inject(['webServer'], (webCtx) => {
    const connection = webCtx.connection;
    const handler = createRouteHandler({
      prefix: PREFIX,
      dispatch,
      requestRejection: (request) => connection.requestRejection(request),
    });
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: PREFIX, handler }),
      'git-panel: rpc route',
    );
  });
}
