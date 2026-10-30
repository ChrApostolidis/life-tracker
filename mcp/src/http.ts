// Streamable HTTP entry, for claude.ai and the phone app. The same tools as the
// stdio entry, behind this server's own OAuth: see issues/MCP_PHASE_2.md.

import { runtime } from './config.ts'; // first: sets process.env.TZ before any Date work
import { serve } from '@hono/node-server';
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  oauthMetadataResponse,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { api, describeLoginError, withBackendSession } from './api.ts';
import { authorizePage, errorPage } from './authorize-page.ts';
import { ALLOWED_REDIRECT_URIS, createOAuth, OAuthFailure } from './oauth.ts';
import { loadOAuthState, saveOAuthState } from './oauth-store.ts';
import { buildServer } from './server.ts';

runtime.hosted = true;

const port = Number(process.env.MCP_PORT) || 3100;
// 127.0.0.1 on a bare host; the container sets 0.0.0.0 and compose binds the port to 127.0.0.1.
const hostname = process.env.MCP_HOST?.trim() || '127.0.0.1';
const publicUrl = new URL(process.env.MCP_PUBLIC_URL?.trim() || `http://localhost:${port}`);
const issuer = publicUrl.origin;
const mcpUrl = new URL('/mcp', issuer);
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);
const allowedHosts = [publicUrl.hostname, 'localhost', '127.0.0.1'];
const MAX_BODY_BYTES = 64 * 1024;

const state = await loadOAuthState();
const oauth = createOAuth({ state, save: () => saveOAuthState(state), resource: mcpUrl.href });

const metadata = {
  oauthMetadata: {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    // Listed so Claude asks for it; a refresh token is issued either way.
    scopes_supported: ['offline_access'],
    authorization_response_iss_parameter_supported: false,
  },
  resourceServerUrl: mcpUrl,
};

const gate = requireBearerAuth({
  resourceMetadataUrl,
  expectedResource: mcpUrl,
  verifier: {
    async verifyAccessToken(token) {
      const grant = oauth.findGrant(token);
      if (!grant) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired token');
      return {
        token,
        clientId: grant.clientId,
        scopes: [],
        expiresAt: Math.floor(grant.accessExpiresAt / 1000),
        resource: mcpUrl,
      };
    },
  },
});

const mcp = createMcpHandler(() => buildServer());

// The page posts the form, then is redirected to Claude: form-action covers both.
const redirectOrigins = ALLOWED_REDIRECT_URIS.map((u) => new URL(u).origin).join(' ');
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirectOrigins}; frame-ancestors 'none'; base-uri 'none'`,
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const html = (body: string, status = 200) => new Response(body, { status, headers: HTML_HEADERS });
const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function readBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new OAuthFailure('invalid_request', 'Request body too large', 413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new OAuthFailure('invalid_request', 'Request body too large', 413);
  return text;
}

async function register(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(request));
  } catch (e) {
    if (e instanceof OAuthFailure) throw e;
    throw new OAuthFailure('invalid_client_metadata', 'The body must be JSON');
  }
  return json(await oauth.register(body), 201);
}

async function authorize(request: Request): Promise<Response> {
  const params =
    request.method === 'POST' ? new URLSearchParams(await readBody(request)) : new URL(request.url).searchParams;
  const check = oauth.checkAuthorize(params);
  if (!check.ok) return check.redirect ? redirect(check.to) : html(errorPage(check.message), 400);
  if (request.method === 'GET') return html(authorizePage(check.request));

  // Checked by the backend, never stored here.
  const password = params.get('password') ?? '';
  try {
    const result = await api.login(password, request.headers.get('cf-connecting-ip') ?? undefined);
    if (!result?.token) {
      return html(errorPage('The Life Tracker server answered without a session token. Is it up to date?'), 502);
    }
    return redirect(oauth.issueCode(check.request, result.token));
  } catch (e) {
    return html(authorizePage(check.request, describeLoginError(e)), 401);
  }
}

async function token(request: Request): Promise<Response> {
  const form = new URLSearchParams(await readBody(request));
  // A client that sends HTTP Basic anyway still names itself there.
  const basic = request.headers.get('authorization')?.match(/^Basic\s+(.+)$/i);
  if (basic && !form.has('client_id')) {
    form.set('client_id', decodeURIComponent(Buffer.from(basic[1], 'base64').toString().split(':')[0]));
  }
  return json(await oauth.token(form));
}

async function serveMcp(request: Request): Promise<Response> {
  const auth = await gate(request);
  if (auth instanceof Response) return auth;
  const grant = oauth.findGrant(auth.token);
  if (!grant) return json({ error: 'invalid_token' }, 401);
  // A 401 from the backend ends the grant, so the next call makes Claude log in again.
  const session = { token: grant.backendToken, onRejected: () => oauth.revoke(grant.id) };
  return withBackendSession(session, () => mcp.fetch(request, { authInfo: auth }));
}

async function route(request: Request): Promise<Response> {
  const hostRefused = hostHeaderValidationResponse(request, allowedHosts);
  if (hostRefused) return hostRefused;
  const wellKnown = oauthMetadataResponse(request, metadata);
  if (wellKnown) return wellKnown;

  const { pathname } = new URL(request.url);
  const method = request.method;
  try {
    if (pathname === '/mcp') return await serveMcp(request);
    if (pathname === '/register' && method === 'POST') return await register(request);
    if (pathname === '/authorize' && (method === 'GET' || method === 'POST')) return await authorize(request);
    if (pathname === '/token' && method === 'POST') return await token(request);
  } catch (e) {
    if (e instanceof OAuthFailure) return json(e.toJSON(), e.status);
    throw e;
  }
  return new Response('Not found', { status: 404 });
}

// One line per request, path only: queries carry codes and state.
async function handle(request: Request): Promise<Response> {
  const started = Date.now();
  let response: Response;
  try {
    response = await route(request);
  } catch (e) {
    console.error('[life-tracker-mcp]', e);
    response = json({ error: 'server_error' }, 500);
  }
  console.log(`${request.method} ${new URL(request.url).pathname} ${response.status} ${Date.now() - started}ms`);
  return response;
}

const server = serve({ fetch: handle, port, hostname }, (info) => {
  console.log(`[life-tracker-mcp] listening on ${info.address}:${info.port}, public URL ${mcpUrl.href}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await mcp.close();
    server.close(() => process.exit(0));
  });
}
