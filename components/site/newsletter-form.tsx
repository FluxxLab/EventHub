'use client';

import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { newsletterMailto, SALES_EMAIL } from '@/lib/site';

/**
 * The newsletter sign-up: an email, then the visitor's mail app opens with the request written.
 * Nothing stores sign-ups yet, so the address is shown as text too.
 */
export function NewsletterForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setNote({ text: 'Enter your email.', error: true });
    const href = newsletterMailto(email.trim());
    if (!href) return setNote({ text: 'The newsletter opens soon.', error: true });
    window.location.href = href;
    setNote({ text: `Your mail app should open. If it doesn’t, write to ${SALES_EMAIL}.`, error: false });
  };

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[500px] flex-col gap-2">
      <div className="flex w-full items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-sm text-ink">
            Email
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
                setNote(null);
              }}
              placeholder="you@organisation.org"
              aria-invalid={note?.error || undefined}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#bdbdbd]"
            />
          </div>
        </div>
        <button type="submit" className={buttonClass({ style: 'outline', color: 'primary', className: 'h-10 shrink-0' })}>
          Subscribe
        </button>
      </div>
      {note && (
        <p className={note.error ? 'text-xs text-danger' : 'text-xs text-[#7c7c7c]'} role={note.error ? 'alert' : undefined}>
          {note.text}
        </p>
      )}
    </form>
  );
}
