'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Notification, type NotificationAction, type NotificationLeading } from '@/components/ui/notification';

export type Toast = {
  title: string;
  body?: ReactNode;
  leading?: NotificationLeading;
  actions?: NotificationAction[];
  /** How long it stays, in ms; 0 keeps it until dismissed. */
  duration?: number;
};

type Shown = Toast & { id: number };
type Api = { push: (toast: Toast) => number; dismiss: (id: number) => void };

const ToastContext = createContext<Api | null>(null);
const DEFAULT_DURATION = 6000;
const MAX_SHOWN = 3;
/** A shade over the exit (150ms, .toast-out). */
const LEAVE_MS = 200;

/** One toast: closes itself after its duration, but not while the pointer or focus is on it. */
function ToastItem({ toast, onDismiss }: { toast: Shown; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? DEFAULT_DURATION;

  useEffect(() => {
    if (paused || duration === 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [paused, duration, onDismiss, toast.id]);

  return (
    <div role="status" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Notification
        title={toast.title}
        // A toast lives seconds, so it is always news.
        meta="Just now"
        leading={toast.leading}
        actions={toast.actions?.map((a) => ({
          ...a,
          onClick: () => {
            a.onClick();
            onDismiss(toast.id);
          },
        }))}
        onClose={() => onDismiss(toast.id)}
      >
        {toast.body}
      </Notification>
    </div>
  );
}

/**
 * Holds the toasts and draws them in the bottom-right corner, newest at the bottom, at most three
 * at a time. `useToast().push(...)` shows one from anywhere in the console.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Shown[]>([]);
  const nextId = useRef(1);

  // a dismissed toast plays its exit first (see .toast-out), then leaves
  const [leaving, setLeaving] = useState<Set<number>>(() => new Set());
  const remove = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
    setLeaving((was) => {
      const next = new Set(was);
      next.delete(id);
      return next;
    });
  }, []);
  const dismiss = useCallback(
    (id: number) => {
      setLeaving((was) => new Set(was).add(id));
      // gone by the time the exit has played, even where the animation never reports its end
      setTimeout(() => remove(id), LEAVE_MS);
    },
    [remove],
  );
  const push = useCallback((toast: Toast) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { ...toast, id }].slice(-MAX_SHOWN));
    return id;
  }, []);
  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={leaving.has(toast.id) ? 'toast-out pointer-events-none' : 'toast-in pointer-events-auto'}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && leaving.has(toast.id)) remove(toast.id);
            }}
          >
            <ToastItem toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Api {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
  return api;
}
