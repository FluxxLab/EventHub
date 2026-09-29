'use client';

import { EnvelopeIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { demoRequestMailto, SALES_EMAIL } from '@/lib/site';

/**
 * The hero's "Request a demo" box: a work email, then the visitor's mail app opens with the
 * request written. There is no backend for demo requests yet, so the sales address is also shown
 * as text: a mail link may do nothing on a machine without a mail app.
 */
export function DemoForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setProblem('Enter your work email.');
    setProblem(null);
    const href = demoRequestMailto(email.trim());
    if (!href) return setProblem('Demo requests open soon.');
    window.location.href = href;
    setSent(true);
  };

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[490px] flex-col gap-2">
      <div className="flex w-full items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-sm text-ink">
            Book a walkthrough for your next event
          </label>
          <div className="flex h-10 items-center gap-1.5 rounded-lg border border-[#bdbdbd] bg-surface px-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]">
            <EnvelopeIcon className="size-5 shrink-0 text-[#525252]" aria-hidden />
            <input
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setProblem(null);
              }}
              placeholder="you@organisation.org"
              aria-invalid={!!problem || undefined}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#bdbdbd]"
            />
          </div>
        </div>
        <button type="submit" className={buttonClass({ className: 'h-10 shrink-0' })}>
          <PaperAirplaneIcon className="size-4" aria-hidden />
          Request a demo
        </button>
      </div>
      <p className={problem ? 'text-xs text-danger' : 'text-xs text-[#7c7c7c]'} role={problem ? 'alert' : undefined}>
        {problem ?? (sent ? `Your mail app should open. If it doesn’t, write to ${SALES_EMAIL}.` : SALES_EMAIL ? `Or write to ${SALES_EMAIL}.` : 'We reply within one working day.')}
      </p>
    </form>
  );
}
