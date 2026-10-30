import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  createOAuth,
  MAX_CLIENTS,
  OAuthFailure,
  REFRESH_TTL_MS,
  type OAuthState,
  type TokenResponse,
} from '../src/oauth.ts';

const RESOURCE = 'https://mcp.example.com/mcp';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a'.repeat(43) + '-._~0123456789';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function setup() {
  let clock = 1_000_000;
  let saves = 0;
  const state: OAuthState = { clients: [], grants: [] };
  const oauth = createOAuth({ state, save: async () => void saves++, resource: RESOURCE, now: () => clock });
  return {
    oauth,
    state,
    saves: () => saves,
    advance: (ms: number) => void (clock += ms),
  };
}

async function registerClaude(oauth: ReturnType<typeof setup>['oauth']): Promise<string> {
  const client = await oauth.register({ redirect_uris: [CALLBACK], client_name: 'Claude' });
  return client.client_id as string;
}

function authorizeParams(clientId: string, extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'xyz',
    ...extra,
  });
}

// The full happy path up to the code, returned with what the redirect carried.
async function getCode(oauth: ReturnType<typeof setup>['oauth'], clientId: string): Promise<string> {
  const check = oauth.checkAuthorize(authorizeParams(clientId));
  assert.ok(check.ok);
  const back = new URL(oauth.issueCode(check.request, 'backend-token'));
  assert.equal(back.origin + back.pathname, CALLBACK);
  assert.equal(back.searchParams.get('state'), 'xyz');
  return back.searchParams.get('code')!;
}

function exchange(clientId: string, code: string, extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_verifier: VERIFIER,
    ...extra,
  });
}

async function rejects(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (e) => e instanceof OAuthFailure && e.code === code);
}

test('registration accepts only Anthropic callbacks', async () => {
  const { oauth, state } = setup();
  await rejects(oauth.register({ redirect_uris: ['https://evil.example/cb'] }), 'invalid_redirect_uri');
  await rejects(oauth.register({ redirect_uris: [CALLBACK, 'http://localhost:3118/callback'] }), 'invalid_redirect_uri');
  await rejects(oauth.register({ redirect_uris: [] }), 'invalid_redirect_uri');
  await rejects(oauth.register({}), 'invalid_redirect_uri');
  assert.equal(state.clients.length, 0);

  const client = await oauth.register({
    redirect_uris: [CALLBACK, 'https://claude.com/api/mcp/auth_callback'],
    token_endpoint_auth_method: 'client_secret_basic',
  });
  // Public whatever it asked for: there is no secret to hand out.
  assert.equal(client.token_endpoint_auth_method, 'none');
  assert.equal(state.clients.length, 1);
});

test('registration evicts the oldest idle clients past the cap', async () => {
  const { oauth, state } = setup();
  const first = await registerClaude(oauth);
  await oauth.token(exchange(first, await getCode(oauth, first)));
  for (let i = 0; i < MAX_CLIENTS + 5; i++) await registerClaude(oauth);
  assert.equal(state.clients.length, MAX_CLIENTS);
  // The connected client survives; idle ones go first.
  assert.ok(state.clients.some((c) => c.id === first));
});

test('authorize refuses an unknown client or redirect without redirecting', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  const unknown = oauth.checkAuthorize(authorizeParams('nope'));
  assert.ok(!unknown.ok && !unknown.redirect);
  const elsewhere = oauth.checkAuthorize(authorizeParams(clientId, { redirect_uri: 'https://evil.example/cb' }));
  assert.ok(!elsewhere.ok && !elsewhere.redirect);
});

test('authorize requires PKCE S256 and redirects the error back with state', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  for (const extra of [{ code_challenge_method: 'plain' }, { code_challenge: '' }]) {
    const check = oauth.checkAuthorize(authorizeParams(clientId, extra));
    assert.ok(!check.ok && check.redirect);
    const to = new URL(check.to);
    assert.equal(to.searchParams.get('error'), 'invalid_request');
    assert.equal(to.searchParams.get('state'), 'xyz');
  }
  const wrongType = oauth.checkAuthorize(authorizeParams(clientId, { response_type: 'token' }));
  assert.ok(!wrongType.ok && wrongType.redirect && wrongType.to.includes('unsupported_response_type'));
});

test('authorize refuses a resource other than this server', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  const other = oauth.checkAuthorize(authorizeParams(clientId, { resource: 'https://other.example/mcp' }));
  assert.ok(!other.ok && other.redirect && other.to.includes('invalid_target'));
  assert.ok(oauth.checkAuthorize(authorizeParams(clientId, { resource: RESOURCE })).ok);
  assert.ok(oauth.checkAuthorize(authorizeParams(clientId, { resource: `${RESOURCE}/` })).ok);
});

test('a code exchanges once for tokens that map to the backend session', async () => {
  const { oauth, state, saves } = setup();
  const clientId = await registerClaude(oauth);
  const code = await getCode(oauth, clientId);
  const tokens = await oauth.token(exchange(clientId, code));
  assert.equal(tokens.token_type, 'Bearer');
  assert.equal(tokens.expires_in, ACCESS_TTL_MS / 1000);
  assert.equal(oauth.findGrant(tokens.access_token)?.backendToken, 'backend-token');
  // Hashes only on disk.
  const stored = JSON.stringify(state);
  assert.ok(!stored.includes(tokens.access_token) && !stored.includes(tokens.refresh_token));
  assert.ok(saves() >= 2);

  await rejects(oauth.token(exchange(clientId, code)), 'invalid_grant');
});

test('a wrong verifier burns the code', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  const code = await getCode(oauth, clientId);
  await rejects(oauth.token(exchange(clientId, code, { code_verifier: 'b'.repeat(43) })), 'invalid_grant');
  await rejects(oauth.token(exchange(clientId, code)), 'invalid_grant');
});

test('a code checks its client and redirect', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  const other = await registerClaude(oauth);
  await rejects(oauth.token(exchange(other, await getCode(oauth, clientId))), 'invalid_grant');
  await rejects(
    oauth.token(exchange(clientId, await getCode(oauth, clientId), { redirect_uri: 'https://claude.com/api/mcp/auth_callback' })),
    'invalid_grant',
  );
});

test('a code expires after 60 seconds', async () => {
  const { oauth, advance } = setup();
  const clientId = await registerClaude(oauth);
  const late = await getCode(oauth, clientId);
  advance(CODE_TTL_MS);
  await rejects(oauth.token(exchange(clientId, late)), 'invalid_grant');

  const inTime = await getCode(oauth, clientId);
  advance(CODE_TTL_MS - 1);
  await oauth.token(exchange(clientId, inTime));
});

test('an access token stops working after its hour', async () => {
  const { oauth, advance } = setup();
  const clientId = await registerClaude(oauth);
  const { access_token } = await oauth.token(exchange(clientId, await getCode(oauth, clientId)));
  advance(ACCESS_TTL_MS - 1);
  assert.ok(oauth.findGrant(access_token));
  advance(1);
  assert.equal(oauth.findGrant(access_token), undefined);
});

function refresh(clientId: string, tokens: TokenResponse): URLSearchParams {
  return new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId });
}

test('refresh rotates both tokens and keeps the backend session', async () => {
  const { oauth, state, advance } = setup();
  const clientId = await registerClaude(oauth);
  const first = await oauth.token(exchange(clientId, await getCode(oauth, clientId)));
  advance(ACCESS_TTL_MS + 1);
  const second = await oauth.token(refresh(clientId, first));
  assert.notEqual(second.refresh_token, first.refresh_token);
  assert.equal(oauth.findGrant(second.access_token)?.backendToken, 'backend-token');
  assert.equal(state.grants.length, 1);

  // The old refresh token died in the same step.
  await rejects(oauth.token(refresh(clientId, first)), 'invalid_grant');
  // And a refresh from another client is refused.
  const other = await registerClaude(oauth);
  await rejects(oauth.token(refresh(other, second)), 'invalid_grant');
});

test('a refresh token expires after 30 days unused, and each refresh slides it', async () => {
  const { oauth, advance } = setup();
  const clientId = await registerClaude(oauth);
  let tokens = await oauth.token(exchange(clientId, await getCode(oauth, clientId)));
  advance(REFRESH_TTL_MS - 1);
  tokens = await oauth.token(refresh(clientId, tokens));
  advance(REFRESH_TTL_MS - 1);
  tokens = await oauth.token(refresh(clientId, tokens));
  advance(REFRESH_TTL_MS);
  await rejects(oauth.token(refresh(clientId, tokens)), 'invalid_grant');
});

test('revoking a grant kills its access and refresh tokens', async () => {
  const { oauth } = setup();
  const clientId = await registerClaude(oauth);
  const tokens = await oauth.token(exchange(clientId, await getCode(oauth, clientId)));
  await oauth.revoke(oauth.findGrant(tokens.access_token)!.id);
  assert.equal(oauth.findGrant(tokens.access_token), undefined);
  await rejects(oauth.token(refresh(clientId, tokens)), 'invalid_grant');
});

test('other grant types are refused', async () => {
  const { oauth } = setup();
  await rejects(oauth.token(new URLSearchParams({ grant_type: 'client_credentials' })), 'unsupported_grant_type');
});
