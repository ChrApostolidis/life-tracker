'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import styles from './login.module.css';

// Where to go after logging in. Only pages of this app: resolving against our
// own origin and checking it survived rejects "https://evil.example" as well
// as "//evil.example" and "/\evil.example", which browsers read as other sites.
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return '/';
  const url = new URL(next, window.location.origin);
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/';
}

function describeLoginError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Could not reach the server. Check your connection and try again.';
  if (e.status === 401) return 'That password is not right.';
  if (e.status === 429) {
    const minutes = Math.max(1, Math.ceil((e.retryAfter ?? 900) / 60));
    return `Too many tries. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  }
  return `Could not log in (HTTP ${e.status}).`;
}

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Already signed in, or the backend is not enforcing auth: nothing to do here.
  // A 401 is the normal answer on this page, so a failure just leaves the form up.
  useEffect(() => {
    api
      .me()
      .then(() => window.location.replace(nextPath()))
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      // A full load, so every provider starts fresh with the new session.
      window.location.assign(nextPath());
    } catch (err) {
      setError(describeLoginError(err));
      setSubmitting(false);
      // Selected rather than cleared, so a typo is fixed by simply typing again.
      inputRef.current?.select();
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.eyebrow}>Life Tracker</p>
        <h1 className={styles.title}>Welcome back</h1>

        {/* The account has no username; this lets password managers file the password under a name. */}
        <input type="text" name="username" autoComplete="username" value="life-tracker" readOnly hidden />

        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <input
          ref={inputRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />

        {error && (
          <p id="login-error" className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={styles.button} disabled={submitting || !password}>
          {submitting ? 'Logging in' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
