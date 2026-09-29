'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ConsoleShell } from '@/components/shell/console-shell';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useSession } from '@/lib/auth/session';

/**
 * Every console page sits behind this: signed-out visitors go to sign-in, staff get the shell
 * (top bar, section rail, page menu).
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const state = useSession();

  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/sign-in');
  }, [state.status, router]);

  if (state.status !== 'signed-in') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
        <LogoLoader />
      </div>
    );
  }
  return <ConsoleShell user={state.user}>{children}</ConsoleShell>;
}
