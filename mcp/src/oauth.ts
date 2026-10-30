// The hosted server's own small OAuth 2.1 authorization server: one user, so
// no identity provider. Clients register themselves (DCR), codes are PKCE-bound
// and single-use, and only hashes of the tokens it issues are ever stored.
// No I/O here: the caller persists `state` through `save` and does the login.

import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Anthropic's callback for claude.ai, Desktop and the phone, plus the one it
// says may replace it. Anything else is refused, so the flow cannot be pointed
// at someone else's site.
export const ALLOWED_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
// Matches the backend's sliding 30-day sessions.
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
// Registration is open to anyone, so the file must not grow without bound.
export const MAX_CLIENTS = 50;

export type Client = { id: string; name: string | null; redirectUris: string[]; createdAt: number };

export type Grant = {
  id: string;
  clientId: string;
  // The backend session this grant acts as. Its own lifetime is the backend's.
  backendToken: string;
  accessHash: string;
  accessExpiresAt: number;
  refreshHash: string;
  refreshExpiresAt: number;
};

export type OAuthState = { clients: Client[]; grants: Grant[] };

export type AuthorizeRequest = {
  clientId: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
};

type PendingCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string | null;
  backendToken: string;
  expiresAt: number;
};

export type TokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope?: string;
};

// An RFC 6749 error. `status` is the HTTP status the endpoint answers with.
export class OAuthFailure extends Error {
  code: string;
  status: number;

  constructor(code: string, description: string, status = 400) {
    super(description);
    this.code = code;
    this.status = status;
  }

  toJSON(): { error: string; error_description: string } {
    return { error: this.code, error_description: this.message };
  }
}

// Bad client or redirect: the user is shown an error page, never redirected,
// since the redirect target is exactly what cannot be trusted.
export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; redirect: false; message: string }
  | { ok: false; redirect: true; to: string };

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const newToken = (): string => randomBytes(32).toString('base64url');

// RFC 7636: the verifier's alphabet and length, then base64url(sha256(verifier)).
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

type Options = {
  state: OAuthState;
  save: () => Promise<void>;
  // The MCP endpoint's URL. A `resource` parameter naming anything else is refused.
  resource: string;
  now?: () => number;
};

export function createOAuth({ state, save, resource, now = Date.now }: Options) {
  // In memory only: they live 60 s, and a restart in between just fails one login.
  const codes = new Map<string, PendingCode>();

  const findClient = (id: string | null) => (id ? state.clients.find((c) => c.id === id) : undefined);

  function checkResource(value: string | null): void {
    if (value && value.replace(/\/$/, '') !== resource.replace(/\/$/, '')) {
      throw new OAuthFailure('invalid_target', `This server only issues tokens for ${resource}`);
    }
  }

  function prune(): void {
    const t = now();
    state.grants = state.grants.filter((g) => g.refreshExpiresAt > t);
    for (const [hash, code] of codes) if (code.expiresAt <= t) codes.delete(hash);
  }

  function issue(clientId: string, backendToken: string, scope: string | null, grantId: string = randomUUID()): TokenResponse {
    const access = newToken();
    const refresh = newToken();
    const t = now();
    state.grants = state.grants.filter((g) => g.id !== grantId);
    state.grants.push({
      id: grantId,
      clientId,
      backendToken,
      accessHash: hashToken(access),
      accessExpiresAt: t + ACCESS_TTL_MS,
      refreshHash: hashToken(refresh),
      refreshExpiresAt: t + REFRESH_TTL_MS,
    });
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_MS / 1000,
      refresh_token: refresh,
      ...(scope ? { scope } : {}),
    };
  }

  return {
    // RFC 7591. Every client is public (PKCE, no secret), whatever it asked for.
    async register(body: unknown): Promise<Record<string, unknown>> {
      const meta = (body ?? {}) as { redirect_uris?: unknown; client_name?: unknown };
      const uris = meta.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === 'string')) {
        throw new OAuthFailure('invalid_redirect_uri', 'redirect_uris must be a non-empty list of URLs');
      }
      const refused = uris.filter((u) => !ALLOWED_REDIRECT_URIS.includes(u));
      if (refused.length > 0) {
        throw new OAuthFailure('invalid_redirect_uri', `Redirect URI not allowed: ${refused.join(', ')}`);
      }
      const name = typeof meta.client_name === 'string' ? meta.client_name.slice(0, 100) : null;
      const client: Client = { id: randomUUID(), name, redirectUris: uris, createdAt: now() };

      // Evict the oldest clients that hold no grant; a connected client is never dropped.
      const inUse = new Set(state.grants.map((g) => g.clientId));
      state.clients.push(client);
      while (state.clients.length > MAX_CLIENTS) {
        const idle = state.clients.findIndex((c) => c !== client && !inUse.has(c.id));
        if (idle === -1) break;
        state.clients.splice(idle, 1);
      }
      await save();

      return {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt / 1000),
        client_name: client.name ?? undefined,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };
    },

    // Shared by GET (show the page) and POST (the password was typed), since
    // the form carries the parameters back and they must be checked again.
    checkAuthorize(params: URLSearchParams): AuthorizeCheck {
      const client = findClient(params.get('client_id'));
      if (!client) return { ok: false, redirect: false, message: 'Unknown client. Remove the connector in Claude and add it again.' };
      const redirectUri = params.get('redirect_uri') ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
      if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
        return { ok: false, redirect: false, message: 'This redirect address is not registered for the client.' };
      }

      const clientState = params.get('state');
      const fail = (error: string, description: string): AuthorizeCheck => ({
        ok: false,
        redirect: true,
        to: errorRedirect(redirectUri, error, description, clientState),
      });
      if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported');
      const codeChallenge = params.get('code_challenge');
      if (!codeChallenge || params.get('code_challenge_method') !== 'S256') {
        return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
      }
      try {
        checkResource(params.get('resource'));
      } catch (e) {
        return fail('invalid_target', (e as Error).message);
      }
      return {
        ok: true,
        request: {
          clientId: client.id,
          clientName: client.name,
          redirectUri,
          codeChallenge,
          state: clientState,
          scope: params.get('scope'),
        },
      };
    },

    // After a successful backend login: the URL to send the browser back to.
    issueCode(request: AuthorizeRequest, backendToken: string): string {
      prune();
      const code = newToken();
      codes.set(hashToken(code), {
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        scope: request.scope,
        backendToken,
        expiresAt: now() + CODE_TTL_MS,
      });
      const url = new URL(request.redirectUri);
      url.searchParams.set('code', code);
      if (request.state) url.searchParams.set('state', request.state);
      return url.toString();
    },

    // The /token endpoint, both grants. Throws OAuthFailure.
    async token(form: URLSearchParams): Promise<TokenResponse> {
      prune();
      const grantType = form.get('grant_type');
      const clientId = form.get('client_id');
      checkResource(form.get('resource'));

      if (grantType === 'authorization_code') {
        const code = form.get('code');
        const hash = code ? hashToken(code) : null;
        const pending = hash ? codes.get(hash) : undefined;
        // Single-use: gone on the first attempt, whether or not it succeeds.
        if (hash) codes.delete(hash);
        if (!pending || pending.expiresAt <= now()) throw new OAuthFailure('invalid_grant', 'The code is invalid or has expired');
        if (clientId && clientId !== pending.clientId) throw new OAuthFailure('invalid_grant', 'The code was issued to another client');
        if (form.get('redirect_uri') !== pending.redirectUri) throw new OAuthFailure('invalid_grant', 'redirect_uri does not match');
        if (!pkceMatches(form.get('code_verifier') ?? '', pending.codeChallenge)) {
          throw new OAuthFailure('invalid_grant', 'code_verifier does not match');
        }
        const tokens = issue(pending.clientId, pending.backendToken, pending.scope);
        await save();
        return tokens;
      }

      if (grantType === 'refresh_token') {
        const refresh = form.get('refresh_token');
        const grant = refresh ? state.grants.find((g) => g.refreshHash === hashToken(refresh)) : undefined;
        if (!grant || (clientId && clientId !== grant.clientId)) {
          throw new OAuthFailure('invalid_grant', 'The refresh token is invalid or has expired');
        }
        // Rotated: the old refresh token stops working in the same step.
        const tokens = issue(grant.clientId, grant.backendToken, form.get('scope'), grant.id);
        await save();
        return tokens;
      }

      throw new OAuthFailure('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
    },

    // For the Bearer gate: the live grant behind an access token, if any.
    findGrant(accessToken: string): Grant | undefined {
      const hash = hashToken(accessToken);
      return state.grants.find((g) => g.accessHash === hash && g.accessExpiresAt > now());
    },

    // The backend rejected the grant's session: the connector must log in again.
    async revoke(grantId: string): Promise<void> {
      state.grants = state.grants.filter((g) => g.id !== grantId);
      await save();
    },
  };
}

export type OAuth = ReturnType<typeof createOAuth>;
