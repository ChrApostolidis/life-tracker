'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api, ApiError, goToLogin, LOGIN_PATH } from '@/lib/api';

type Props = {
  // The page alone. Shown bare on /login: no shell, and none of the providers
  // that fetch on mount, which would get 401 and loop straight back to /login.
  page: ReactNode;
  // The whole app — providers, shell and page — for every other route.
  children: ReactNode;
};

/**
 * Asks the API once per page load whether you are signed in. Not a security
 * boundary: the API enforces auth itself. This only decides what to show, and
 * because /api/auth/me answers yes whenever the backend is not enforcing, the
 * web app follows the backend's switch with no setting of its own.
 */
export default function AuthGate({ page, children }: Props) {
  const onLoginPage = usePathname() === LOGIN_PATH;
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (onLoginPage) return;
    let cancelled = false;
    api
      .me()
      .then(() => {
        if (!cancelled) setSignedIn(true);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          goToLogin();
          return;
        }
        // Server down or unreachable: show the app anyway, so each page shows
        // its own error state as it did before login existed.
        setSignedIn(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoginPage]);

  if (onLoginPage) return page;
  // One short round trip on a cold load; the page background shows meanwhile.
  return signedIn ? children : null;
}
