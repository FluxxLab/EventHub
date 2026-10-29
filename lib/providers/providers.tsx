'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/client';
import { session } from '@/lib/auth/session';
import { reloadIfStale } from '@/lib/stale-build';

/**
 * App-wide providers. Reads go through TanStack Query: 30 s freshness suits a console watching a
 * live event, and client errors (4xx) are not retried because retrying cannot fix them.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    void session.restore();
  }, []);

  // a page opened before a deploy reloads when it reaches for the old build's code
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => void reloadIfStale(e.reason);
    const onError = (e: ErrorEvent) => void reloadIfStale(e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
