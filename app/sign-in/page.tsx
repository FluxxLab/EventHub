'use client';

import { ArrowLeftIcon, CheckCircleIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { z } from 'zod';

import { session, useSession } from '@/lib/auth/session';
import { requestResetCode, RESEND_AFTER_S, resetPassword, resetSchema } from '@/lib/auth/password-reset';
import { cn } from '@/lib/utils';

const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').min(8, 'Passwords are at least 8 characters.'),
});
const emailSchema = z.email('Enter a valid email address.');

type Mode = 'sign-in' | 'request' | 'reset';

const inputClass =
  'h-12 w-full rounded-[10px] border bg-[#fdfdfd] px-5 text-sm text-ink outline-none transition-colors placeholder:text-[#7c7c7c] focus:border-primary focus:ring-4 focus:ring-primary-soft';
const primaryClass =
  'h-12 w-full rounded-[10px] bg-primary px-5 text-base font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60';

/** Taller screens get the design's full spacing; shorter ones tighten so nothing scrolls. */
const FORM = 'flex w-full max-w-[404px] flex-col gap-5 [@media(min-height:800px)]:gap-[25px]';

const firstErrors = <K extends string>(issues: { path: PropertyKey[]; message: string }[]) => {
  const out: Partial<Record<K, string>> = {};
  for (const issue of issues) out[issue.path[0] as K] ??= issue.message;
  return out;
};

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-medium leading-[37px] text-ink">{title}</h1>
      <p className="text-base leading-5 text-[#7c7c7c]">{children}</p>
    </div>
  );
}

/** A label over a 48px input, its error under it; `action` sits at the label's right (Forgot password?). */
function Field({ id, label, error, action, password, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; action?: ReactNode; password?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between py-2.5">
        <label htmlFor={id} className="text-sm font-medium leading-[17px] text-ink">
          {label}
        </label>
        {action}
      </div>
      <div className="relative">
        <input
          id={id}
          {...props}
          type={password ? (shown ? 'text' : 'password') : props.type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(inputClass, password && 'pr-12', error ? 'border-danger' : 'border-[#dcdcdc]', className)}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            className="absolute inset-y-0 right-2 my-auto flex size-9 items-center justify-center rounded-lg text-[#7c7c7c] hover:bg-[#f6f6f6] hover:text-ink"
          >
            {shown ? <EyeSlashIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Alert({ tone, children }: { tone: 'danger' | 'success'; children: ReactNode }) {
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-[10px] px-4 py-3 text-sm', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
      {tone === 'success' && <CheckCircleIcon className="size-5 shrink-0" />}
      {children}
    </p>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 self-start text-sm text-[#7c7c7c] hover:text-ink">
      <ArrowLeftIcon className="size-4" /> Back to sign in
    </button>
  );
}

/**
 * Organiser sign-in, and the forgotten-password route beside it (a code by email, then a new
 * password), all on one screen: the form on the left, the picture on the right on large screens.
 * Delegate accounts are refused by the session layer with a plain reason.
 */
export default function SignInPage() {
  const router = useRouter();
  const state = useSession();
  const id = useId();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'otp' | 'newPassword', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (state.status === 'signed-in') router.replace('/');
  }, [state.status, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const go = (next: Mode, message: string | null = null) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(message);
  };

  const run = async (work: () => Promise<void>) => {
    setFormError(null);
    setPending(true);
    try {
      await work();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  };

  const signIn = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(firstErrors(parsed.error.issues));
    setErrors({});
    void run(async () => {
      await session.signIn(parsed.data.email, parsed.data.password);
      router.replace('/');
    });
  };

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) return setErrors({ email: parsed.error.issues[0]!.message });
    setErrors({});
    void run(async () => {
      await requestResetCode(parsed.data);
      setOtp('');
      setNewPassword('');
      setResendIn(RESEND_AFTER_S);
      go('reset', `If ${parsed.data} has an account, a 6-digit code is on its way. Check spam if it does not arrive in a minute.`);
    });
  };

  const reset = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const parsed = resetSchema.safeParse({ otp, newPassword });
    if (!parsed.success) return setErrors(firstErrors(parsed.error.issues));
    setErrors({});
    void run(async () => {
      await resetPassword(email, parsed.data.otp, parsed.data.newPassword);
      setPassword('');
      go('sign-in', 'Password changed. Sign in with your new password.');
    });
  };

  return (
    <main className="grid h-dvh overflow-hidden bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,45%)]">
      <section className={'flex h-dvh min-h-0 flex-col px-6 py-6 sm:px-12 lg:px-[clamp(3rem,8vw,135px)] [@media(min-height:800px)]:py-10'}>
        <Image src="/pic-logo.png" alt="Policy Innovation Centre" width={64} height={64} priority className={'h-auto w-11 shrink-0 [@media(min-height:800px)]:w-14'} />

        <div className="flex min-h-0 flex-1 items-center">
          {mode === 'sign-in' ? (
            <form onSubmit={signIn} noValidate className={FORM}>
              <Heading title="Sign in">Welcome back. Enter your organiser account details.</Heading>
              {notice && <Alert tone="success">{notice}</Alert>}
              <div className="flex flex-col gap-[5px]">
                <Field id={`${id}-email`} label="Email" type="email" autoComplete="username" placeholder="you@policyinnovationcentre.org" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
                <Field
                  id={`${id}-password`}
                  label="Password"
                  password
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={errors.password}
                  action={
                    <button type="button" onClick={() => go('request')} className="text-sm leading-[17px] text-primary hover:underline">
                      Forgot password?
                    </button>
                  }
                />
              </div>
              {formError && <Alert tone="danger">{formError}</Alert>}
              <button type="submit" disabled={pending} className={primaryClass}>
                {pending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : mode === 'request' ? (
            <form onSubmit={sendCode} noValidate className={FORM}>
              <BackLink onClick={() => go('sign-in')} />
              <Heading title="Reset your password">Enter your account email and we will send you a 6-digit code.</Heading>
              <Field id={`${id}-reset-email`} label="Email" type="email" autoComplete="username" placeholder="you@policyinnovationcentre.org" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoFocus />
              {formError && <Alert tone="danger">{formError}</Alert>}
              <button type="submit" disabled={pending} className={primaryClass}>
                {pending ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={reset} noValidate className={FORM}>
              <BackLink onClick={() => go('sign-in')} />
              <Heading title="Check your email">Enter the code we sent and choose a new password.</Heading>
              {notice && !formError && <Alert tone="success">{notice}</Alert>}
              <div className="flex flex-col gap-[5px]">
                <Field
                  id={`${id}-otp`}
                  label="Code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  error={errors.otp}
                  autoFocus
                  className="tracking-[0.3em]"
                  action={
                    <button type="button" onClick={() => sendCode()} disabled={pending || resendIn > 0} className="text-sm leading-[17px] text-primary hover:underline disabled:text-[#7c7c7c] disabled:no-underline">
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  }
                />
                <Field id={`${id}-new`} label="New password" password autoComplete="new-password" placeholder="At least 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={errors.newPassword} />
              </div>
              {formError && <Alert tone="danger">{formError}</Alert>}
              <button type="submit" disabled={pending} className={primaryClass}>
                {pending ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>

        <p className="shrink-0 text-xs text-[#7c7c7c]">Organiser and staff accounts only. Delegates use the PIC Events app.</p>
      </section>

      {/* The picture half: PIC navy with the gold accent until a photo from the summit replaces it. */}
      <aside aria-hidden className="relative hidden h-dvh overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.14),transparent_45%),radial-gradient(circle_at_15%_85%,rgba(201,162,39,0.35),transparent_40%)]" />
        <svg viewBox="0 0 400 400" className="absolute -right-24 top-1/2 w-[130%] -translate-y-1/2 text-white/10" fill="none" stroke="currentColor">
          {[60, 100, 140, 180, 220].map((r) => (
            <circle key={r} cx={260} cy={200} r={r} strokeWidth={1} />
          ))}
        </svg>
        <div className="absolute inset-0 bg-[#1b212d]/10" />
        <div className="absolute inset-x-10 bottom-10 text-white xl:inset-x-14">
          <p className="max-w-md text-2xl font-medium leading-tight xl:text-3xl">Programme, tickets, delegates and the live room, in one place.</p>
          <span className="mt-5 block h-1 w-16 rounded-full bg-secondary" />
        </div>
      </aside>
    </main>
  );
}
