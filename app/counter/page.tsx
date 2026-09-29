'use client';

import { CameraIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { canUseCamera, QrScanner } from '@/components/ui/qr-scanner';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api/client';
import { counterKeyFromHash, mealWindow, pickMeal, type ServeResult } from '@/lib/meals/meals';
import { useCounter, useServe } from '@/lib/meals/use-meals';
import { cn } from '@/lib/utils';

const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

/** How long a result stays up before the counter is ready for the next person. */
const RESULT_MS = 3500;

type Result = { kind: 'served'; data: ServeResult } | { kind: 'already'; message: string } | { kind: 'problem'; message: string };

/**
 * A food counter's scanner, opened from its private link on a phone or tablet. No account: the key
 * after `#` says which counter it is. Staff pick the meal (the one being served now is chosen for
 * them), scan the delegate's ticket QR, and get a large green "Serve" or red "Already collected".
 */
export default function CounterPage() {
  // null until the browser has read the link (the server never sees what follows `#`)
  const key = useSyncExternalStore(subscribeHash, () => counterKeyFromHash(window.location.hash) ?? '', () => null);
  return <div className="min-h-dvh bg-[#f6f6f6]">{key === null ? null : key === '' ? <Invalid /> : <Counter key={key} counterKey={key} />}</div>;
}

function Invalid({ message }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Image src="/pic-logo.png" alt="Policy Innovation Centre" width={72} height={72} priority />
      <h1 className="text-xl font-medium text-ink">This counter link does not work</h1>
      <p className="text-sm text-[#525252]">{message ?? 'It may have been copied only in part, or replaced by a newer link.'} Ask the event organisers for the counter’s current link.</p>
    </main>
  );
}

function Counter({ counterKey }: { counterKey: string }) {
  const view = useCounter(counterKey);
  const serve = useServe(counterKey);
  const [chosen, setChosen] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [typed, setTyped] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCameraOk(canUseCamera()));
    return () => cancelAnimationFrame(id);
  }, []);
  // the next person: the result clears on its own
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  if (view.isPending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center">
        <p className="text-sm text-[#7c7c7c]">Opening the counter…</p>
      </main>
    );
  }
  if (view.isError) {
    if (view.error instanceof ApiError && view.error.status === 401) return <Invalid message={view.error.message.replace(/ Ask the organisers.*$/, '')} />;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium text-ink">The counter could not load.</p>
        <p className="text-sm text-[#525252]">{view.error.message}</p>
        <button type="button" onClick={() => void view.refetch()} className={buttonClass()}>
          Try again
        </button>
      </main>
    );
  }

  const { counter, edition, meals } = view.data;
  const meal = pickMeal(meals, chosen);

  const submit = (input: { qr?: string; code?: string }) => {
    // one ticket at a time: a camera sees the same QR many times a second
    if (!meal || busy.current || result) return;
    busy.current = true;
    serve.mutate(
      { mealId: meal.id, ...input },
      {
        onSuccess: (data) => {
          setResult({ kind: 'served', data });
          navigator.vibrate?.(80);
        },
        onError: (e) => {
          setResult(e instanceof ApiError && e.status === 409 ? { kind: 'already', message: e.message } : { kind: 'problem', message: e.message });
          navigator.vibrate?.([60, 80, 60]);
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };
  const onTyped = (e: FormEvent) => {
    e.preventDefault();
    const value = typed.trim();
    setTyped('');
    if (!value) return;
    // a hand scanner types the QR payload; a person types the short ticket code
    submit(value.toUpperCase().startsWith('PICT1.') ? { qr: value } : { code: value });
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <Image src="/pic-logo.png" alt="" width={40} height={40} className="shrink-0" priority />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium text-ink">{counter.name}</h1>
          <p className="truncate text-xs text-[#7c7c7c]">{edition.shortName} · food counter</p>
        </div>
        {meal && (
          <div className="text-right">
            <p className="text-2xl font-medium leading-none tabular-nums text-ink">{meal.served.toLocaleString('en-GB')}</p>
            <p className="text-xs text-[#7c7c7c]">served</p>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink">Serving</span>
        {meals.length ? (
          <Select
            label="Meal"
            value={meal?.id ?? ''}
            options={[...(meal ? [] : [{ value: '', label: 'Choose a meal' }]), ...meals.map((m) => ({ value: m.id, label: `${m.name}${m.open ? ' · now' : ''}` }))]}
            onChange={(v) => setChosen(v || null)}
          />
        ) : (
          <p className="text-sm text-[#7c7c7c]">The organisers have not added any meals yet.</p>
        )}
        {meal && <p className="text-xs text-[#7c7c7c]">{mealWindow(meal)}{meal.open ? '' : ' · not being served now'}</p>}
      </div>

      {result ? (
        <ResultCard result={result} onNext={() => setResult(null)} />
      ) : !meal ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-[#525252]">No meal is being served right now. Choose one above when serving starts.</p>
      ) : camera ? (
        <QrScanner onCode={(text) => submit({ qr: text })} onClose={() => setCamera(false)} />
      ) : (
        <button type="button" onClick={() => setCamera(true)} disabled={!cameraOk} className={buttonClass({ className: 'h-16 w-full text-base' })}>
          <CameraIcon className="size-6" />
          Scan a ticket
        </button>
      )}
      {!cameraOk && !result && meal && <p className="-mt-2 text-center text-xs text-[#7c7c7c]">This browser cannot use the camera. Open the link in Chrome or Safari, or type the ticket code below.</p>}

      {meal && (
        <form onSubmit={onTyped} className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type the ticket code, e.g. PIC-DEL-3QX7"
            aria-label="Ticket code"
            autoComplete="off"
            autoCapitalize="characters"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none placeholder:text-placeholder focus:border-primary"
          />
          <button type="submit" disabled={serve.isPending} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-10' })}>
            Check
          </button>
        </form>
      )}
    </main>
  );
}

/** The answer, large enough to read at arm's length across a serving table. */
function ResultCard({ result, onNext }: { result: Result; onNext: () => void }) {
  const served = result.kind === 'served';
  const Icon = served ? CheckCircleIcon : result.kind === 'already' ? XCircleIcon : ExclamationTriangleIcon;
  return (
    <section
      role="status"
      aria-live="assertive"
      className={cn(
        'screen-in flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center',
        served ? 'border-success bg-success-soft' : result.kind === 'already' ? 'border-danger bg-danger-soft' : 'border-gold bg-secondary-soft',
      )}
    >
      <Icon className={cn('check-pop size-16', served ? 'text-success' : result.kind === 'already' ? 'text-danger' : 'text-gold')} strokeWidth={1.25} />
      {served ? (
        <>
          <p className="text-sm uppercase tracking-widest text-success">Serve</p>
          <p className="text-2xl font-medium text-ink">{result.data.holder}</p>
          <p className="text-sm text-[#525252]">
            {result.data.tier}
            {result.data.of > 1 ? ` · plate ${result.data.seat} of ${result.data.of} on this ticket` : ''}
          </p>
        </>
      ) : (
        <>
          <p className={cn('text-sm uppercase tracking-widest', result.kind === 'already' ? 'text-danger' : 'text-gold')}>{result.kind === 'already' ? 'Already collected' : 'Not served'}</p>
          <p className="text-base text-ink">{result.message}</p>
        </>
      )}
      <button type="button" onClick={onNext} className={buttonClass({ style: 'outline', color: 'gray', className: 'mt-1' })}>
        Next person
      </button>
    </section>
  );
}
