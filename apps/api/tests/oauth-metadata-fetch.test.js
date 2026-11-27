import http from 'node:http';
import { once } from 'node:events';
import { afterAll, describe, expect, it } from 'vitest';
import { Agent } from 'undici';
import { closeOauthMetadataDispatcher, oauthMetadataFetch } from '../src/modules/oauth/oauthMetadataFetch.js';

afterAll(async () => {
  await closeOauthMetadataDispatcher();
});

function listen() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=60' });
    res.end(JSON.stringify({ client_id: 'ok', path: req.url }));
  });
  server.listen(0, '127.0.0.1');
  return { server, ready: once(server, 'listening') };
}

describe('OAuth metadata fetch', () => {
  it('rejects the Node 20 fetch handler on the undici dispatcher oidc-provider builds', async () => {
    const installed = globalThis[Symbol.for('undici.globalDispatcher.2')];
    expect(installed?.constructor?.name).toBe('Agent');
    const agent = new installed.constructor();
    let error;
    try {
      agent.dispatch({
        origin: 'https://chatgpt.com',
        path: '/oauth/client.json',
        method: 'GET',
        headers: ['accept', 'application/json', 'user-agent', ''],
        maxRedirections: 0,
      }, {
        body: null,
        abort: null,
        onConnect() {},
        onResponseStarted() {},
        onHeaders() { return true; },
        onData() { return true; },
        onComplete() {},
        onError() {},
        onUpgrade() {},
      });
    } catch (caught) {
      error = caught;
    } finally {
      await agent.close();
    }
    expect(error).toMatchObject({
      name: 'InvalidArgumentError',
      code: 'UND_ERR_INVALID_ARG',
      message: 'invalid onRequestStart method',
    });
  });

  it('reads a metadata document with that same dispatcher', async () => {
    const { server, ready } = listen();
    await ready;
    const { port } = server.address();
    const agent = new Agent();
    try {
      const response = await oauthMetadataFetch(`http://127.0.0.1:${port}/oauth/client.json`, {
        method: 'GET',
        headers: new Headers({ accept: 'application/json', 'user-agent': '' }),
        redirect: 'manual',
        signal: AbortSignal.timeout(2500),
        dispatcher: agent,
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ client_id: 'ok' });
    } finally {
      await agent.close();
      server.close();
    }
  });

  it('replaces an incompatible dispatcher and still refuses a special-use address', async () => {
    const { server, ready } = listen();
    await ready;
    const { port } = server.address();
    let usedForeign = false;
    const foreign = {
      dispatch() {
        usedForeign = true;
      },
    };
    const attempt = oauthMetadataFetch(`http://127.0.0.1:${port}/oauth/jwks.json`, {
      method: 'GET',
      headers: new Headers({ accept: 'application/json', 'user-agent': '' }),
      redirect: 'manual',
      dispatcher: foreign,
    });
    await expect(attempt).rejects.toMatchObject({
      message: 'fetch failed',
      cause: { message: 'hostname resolves to a special-use IP address' },
    });
    expect(usedForeign).toBe(false);
    server.close();
  });
});