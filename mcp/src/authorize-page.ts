// The /authorize page: the web app's /login look, as one static HTML string
// (no build step, no script). Styles mirror src/app/login/login.module.css.

import type { AuthorizeRequest } from './oauth.ts';

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STYLE = `
:root { --bg:#0e0f12; --bg-elevated:#16181b; --border:#262932; --text-primary:#ecedee;
  --text-secondary:#9ca3af; --text-muted:#6b7280; --accent:#6b9bd1; --mic-active:#f87171; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',system-ui,sans-serif; background:var(--bg); color:var(--text-primary);
  -webkit-font-smoothing:antialiased; }
main { display:grid; place-items:center; min-height:100vh; min-height:100dvh; padding:24px 16px;
  background:radial-gradient(ellipse at 50% 30%, rgba(107,155,209,0.1), transparent 60%); }
.card { display:flex; flex-direction:column; width:100%; max-width:360px; padding:24px;
  background:var(--bg-elevated); border:1px solid var(--border); border-radius:12px; }
.eyebrow { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; letter-spacing:1.2px;
  text-transform:uppercase; color:var(--text-muted); }
h1 { margin:8px 0 8px; font-size:28px; font-weight:600; line-height:1.2; letter-spacing:-0.4px; }
.lead { margin-bottom:24px; font-size:14px; line-height:1.5; color:var(--text-secondary); }
.lead strong { font-weight:500; color:var(--text-primary); }
label { margin-bottom:8px; font-size:14px; color:var(--text-secondary); }
input { min-height:44px; padding:10px 12px; background:var(--bg); color:var(--text-primary);
  border:1.5px solid var(--border); border-radius:8px; font-size:16px; font-family:inherit; }
input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 4px rgba(107,155,209,0.1); }
input[aria-invalid='true'] { border-color:var(--mic-active); }
.error { margin-top:8px; font-size:14px; color:var(--mic-active); }
button { min-height:44px; margin-top:16px; padding:10px 16px; background:var(--accent); color:var(--bg);
  border:none; border-radius:8px; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; }
button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media (max-width:767px) { .card { padding:16px; } }
`;

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Life Tracker · Connect Claude</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

// The parameters travel back in hidden fields, and are checked again on POST.
export function authorizePage(request: AuthorizeRequest, error: string | null = null): string {
  const hidden: Record<string, string | null> = {
    response_type: 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
    state: request.state,
    scope: request.scope,
  };
  const fields = Object.entries(hidden)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value)}">`)
    .join('');
  // The MCP spec asks for the redirect's host to be shown on the consent screen.
  const host = new URL(request.redirectUri).host;
  const client = request.clientName ?? 'Claude';
  const invalid = error ? ' aria-invalid="true" aria-describedby="login-error"' : '';

  return page(`<form class="card" method="post" action="/authorize">
<p class="eyebrow">Life Tracker</p>
<h1>Connect Claude</h1>
<p class="lead"><strong>${escape(client)}</strong> wants to read and write your Life Tracker. You will be sent back to <strong>${escape(host)}</strong>.</p>
${fields}
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus${invalid}>
${error ? `<p id="login-error" class="error" role="alert">${escape(error)}</p>` : ''}
<button type="submit">Allow</button>
</form>`);
}

export function errorPage(message: string): string {
  return page(`<div class="card">
<p class="eyebrow">Life Tracker</p>
<h1>Can't connect</h1>
<p class="lead">${escape(message)}</p>
</div>`);
}
