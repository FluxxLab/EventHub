'use client';

import { CheckCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';

type Status = { email: string; unsubscribed: boolean };

/**
 * Where the unsubscribe link in a campaign email lands. Nothing changes until the person presses the
 * button: mail scanners open every link in an email, and must not unsubscribe anyone by doing so.
 */
export default function UnsubscribePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f6f6f6] px-5">
      <Suspense>
        <Unsubscribe />
      </Suspense>
    </div>
  );
}

function Unsubscribe() {
  const token = useSearchParams().get('t') ?? '';
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(token ? null : 'This link is not complete. Open it again from the email.');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (DEMO_MODE ? Promise.resolve({ email: 'ngozi.eze@example.com', unsubscribed: false }) : api.get<Status>('/email/unsubscribe', { t: token }))
      .then((s) => live && setStatus(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [token]);

  const change = async (unsubscribe: boolean) => {
    setPending(true);
    setError(null);
    try {
      const next = DEMO_MODE ? { email: status!.email, unsubscribed: unsubscribe } : await api.postPublic<Status>(unsubscribe ? '/email/unsubscribe' : '/email/resubscribe', { t: token });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
      <Image src="/pic-logo.png" alt="Policy Innovation Centre" width={64} height={64} className="mx-auto" priority />
      {error ? (
        <>
          <h1 className="mt-5 text-xl font-medium text-ink">That did not work</h1>
          <p className="mt-2 text-sm text-[#525252]">{error}</p>
        </>
      ) : !status ? (
        <p className="mt-5 text-sm text-[#7c7c7c]">One moment…</p>
      ) : status.unsubscribed ? (
        <>
          <CheckCircleIcon className="mx-auto mt-5 size-10 text-success" />
          <h1 className="mt-2 text-xl font-medium text-ink">You are unsubscribed</h1>
          <p className="mt-2 text-sm text-[#525252]">
            <span className="text-ink">{status.email}</span> will not get event emails from the Policy Innovation Centre. Your tickets and sign-in codes still arrive.
          </p>
          <button type="button" disabled={pending} onClick={() => void change(false)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'mt-4' })}>
            Changed your mind? Get event emails again
          </button>
        </>
      ) : (
        <>
          <h1 className="mt-5 text-xl font-medium text-ink">Stop event emails?</h1>
          <p className="mt-2 text-sm text-[#525252]">
            <span className="text-ink">{status.email}</span> will stop getting announcements and updates about Policy Innovation Centre events. Tickets and sign-in codes still arrive.
          </p>
          <button type="button" disabled={pending} onClick={() => void change(true)} className={buttonClass({ className: 'mt-6 w-full' })}>
            {pending ? 'One moment…' : 'Unsubscribe'}
          </button>
        </>
      )}
    </main>
  );
}
