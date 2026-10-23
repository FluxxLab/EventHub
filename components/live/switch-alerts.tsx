'use client';

import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { useToast } from '@/components/ui/toaster';
import { canControlLive, type StaffTier } from '@/lib/auth/session';
import { useSwitchDecision, useSwitchSuggestions, type SwitchSuggestion } from '@/lib/live/use-switch';

const SEEN_KEY = 'switch-alerts-seen';

/** Two soft rising notes, so a suggestion is heard by whoever is at the desk. Silent if the browser blocks sound. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // no sound this time; the alert still shows
  }
}

const readSeen = (): Set<string> => {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};
const writeSeen = (seen: Set<string>) => {
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-50)));
  } catch {
    // remembered for this page only
  }
};

const headline = (s: SwitchSuggestion) => (s.kind === 'start_next' ? `${s.room}: the next session may have started` : `${s.room}: the session may have ended`);

/**
 * The AI's changeover suggestions, on every console page: a chime and an alert that stays until
 * answered, and the tab title flags it. Live ops still holds the switch itself; the alert takes
 * you there, or says not yet.
 */
export function SwitchAlerts({ tier }: { tier: StaffTier }) {
  const allowed = canControlLive(tier);
  const switches = useSwitchSuggestions(allowed);
  const decision = useSwitchDecision();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(new Map<string, number>());
  const data = switches.data;
  const open = useMemo(() => (data?.enabled ? data.open : []), [data]);
  const dismiss = decision.mutate;
  const onLive = pathname.startsWith('/live');

  useEffect(() => {
    if (!allowed) return;
    const seen = readSeen();
    let fresh = false;
    for (const s of open) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        fresh = true;
      }
      // Live ops shows its own card; elsewhere, one alert per suggestion
      if (onLive || shown.current.has(s.id)) continue;
      const id = toast.push({
        title: headline(s),
        body: `${s.reason} “${s.evidence.length > 140 ? `${s.evidence.slice(0, 140)}…` : s.evidence}”`,
        leading: { kind: 'icon', icon: ArrowPathRoundedSquareIcon },
        duration: 0,
        actions: [
          { label: 'Open Live ops', primary: true, onClick: () => router.push('/live') },
          { label: 'Not yet', onClick: () => dismiss({ id: s.id, decision: 'dismiss' }) },
        ],
      });
      shown.current.set(s.id, id);
    }
    if (fresh) {
      writeSeen(seen);
      chime();
    }
    // a suggestion answered or put away elsewhere takes its alert with it
    for (const [sid, tid] of shown.current) {
      if (!open.some((s) => s.id === sid)) {
        toast.dismiss(tid);
        shown.current.delete(sid);
      }
    }
  }, [open, allowed, onLive, toast, router, dismiss]);

  // the tab title flags a waiting suggestion, for a desk with many tabs open
  const waiting = open.length;
  useEffect(() => {
    if (!waiting) return;
    const flag = '● Changeover? · ';
    // the page's own title is read each time, so moving between pages keeps it right
    const base = () => document.title.replace(flag, '');
    const timer = setInterval(() => {
      document.title = document.title.startsWith(flag) ? base() : `${flag}${base()}`;
    }, 1500);
    return () => {
      clearInterval(timer);
      document.title = base();
    };
  }, [waiting]);

  return null;
}
