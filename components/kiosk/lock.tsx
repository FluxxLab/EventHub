'use client';

import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { hashPin } from '@/lib/checkin/kiosk';
import { cn } from '@/lib/utils';

/*
 * The lock for screens left running in public (self check-in, display boards): staff hold the
 * top-right corner for three seconds, then enter the PIN chosen when the screen was started.
 */

/** Held for three seconds, the top-right corner asks for the staff PIN. Invisible to the public. */
export function ExitCorner({ onUnlock }: { onUnlock: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => clearTimeout(timer.current);
  return (
    <div
      aria-hidden
      className="absolute right-0 top-0 z-40 size-20"
      onPointerDown={() => {
        stop();
        timer.current = setTimeout(onUnlock, 3000);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    />
  );
}

/**
 * A box for choosing the staff PIN. Not a password field: browsers offer saved logins to those and
 * would put the staff member's email and password into the setup form, leaving a PIN nobody chose.
 * Digits are masked with CSS instead.
 */
export function PinInput({ value, onChange, name, className }: { value: string; onChange: (pin: string) => void; name: string; className?: string }) {
  return (
    <input
      type="text"
      name={name}
      inputMode="numeric"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className={cn('[-webkit-text-security:disc]', className)}
    />
  );
}

/** The staff PIN, on a keypad; the locked screen ends only with the right one. */
export function PinPad({ pinHash, onCancel, onUnlock }: { pinHash: string; onCancel: () => void; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const press = async (digit: string) => {
    const next = `${pin}${digit}`.slice(0, 6);
    setPin(next);
    setWrong(false);
    if (next.length >= 4 && (await hashPin(next)) === pinHash) onUnlock();
    else if (next.length === 6) {
      setWrong(true);
      setPin('');
    }
  };
  // idle: back to the public screen
  useEffect(() => {
    const timer = setTimeout(onCancel, 20_000);
    return () => clearTimeout(timer);
  }, [pin, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-5" role="dialog" aria-modal="true" aria-label="Staff PIN">
      <div className="w-full max-w-xs rounded-2xl bg-surface p-6 text-center shadow-xl">
        <LockClosedIcon className="mx-auto size-8 text-primary" />
        <p className="mt-2 font-medium text-ink">Staff PIN</p>
        <p className={cn('mt-1 h-5 text-sm', wrong ? 'text-danger' : 'text-[#7c7c7c]')}>{wrong ? 'That PIN is not right.' : '•'.repeat(pin.length) || 'Enter the PIN to leave'}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => void press(d)} className="h-14 rounded-xl bg-[#f1f1f1] text-xl text-ink active:bg-primary-soft">
              {d}
            </button>
          ))}
          <button type="button" onClick={onCancel} className="h-14 rounded-xl text-sm text-[#525252]">
            Cancel
          </button>
          <button type="button" onClick={() => void press('0')} className="h-14 rounded-xl bg-[#f1f1f1] text-xl text-ink active:bg-primary-soft">
            0
          </button>
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="h-14 rounded-xl text-sm text-[#525252]">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
