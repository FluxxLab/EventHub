'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/client';
import { session } from '@/lib/auth/session';

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

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
