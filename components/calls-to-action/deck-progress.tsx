'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/** What the wait is spent on, and roughly when each starts (seconds): one request, so the steps are paced, not reported. */
const STEPS = [
  { at: 0, label: 'Reading the approved calls' },
  { at: 6, label: "Choosing colours from the event's logo" },
  { at: 16, label: 'Drawing the artwork' },
  { at: 42, label: 'Laying out the slides' },
] as const;

/**
 * While a deck is made: a small slide drawing itself in the event's colour (arcs tracing in, forms
 * growing, lines of text appearing), and the stages ticking off beneath it. Still for anyone whose
 * device asks for reduced motion.
 */
export function DeckProgress({ colour, kind }: { colour: string; kind: 'session' | 'day' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STEPS.reduce((at, step, i) => (seconds >= step.at ? i : at), 0);
  const gold = '#F5C400';

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-soft p-3">
        <svg viewBox="0 0 320 180" role="img" aria-label="The deck being designed" className="deck-art block h-auto w-full">
          <rect width="320" height="180" rx="6" fill="#ffffff" />
          {/* the artwork: forms grow in the corner, arcs trace round them */}
          <g className="deck-grow" style={{ transformOrigin: '290px 40px' }}>
            <circle cx="290" cy="40" r="58" fill={colour} fillOpacity="0.18" />
          </g>
          <g className="deck-grow" style={{ transformOrigin: '300px 30px', animationDelay: '0.4s' }}>
            <circle cx="300" cy="30" r="34" fill={colour} fillOpacity="0.55" />
          </g>
          <path className="deck-draw" d="M232 24 A62 62 0 0 1 300 104" fill="none" stroke={gold} strokeWidth="7" strokeLinecap="round" pathLength="100" />
          <path className="deck-draw" style={{ animationDelay: '0.6s' }} d="M226 60 A78 78 0 0 0 290 122" fill="none" stroke={colour} strokeWidth="1.2" strokeDasharray="2 4" pathLength="100" />
          <g className="deck-grow" style={{ transformOrigin: '22px 168px', animationDelay: '0.8s' }}>
            <circle cx="22" cy="168" r="24" fill={gold} fillOpacity="0.5" />
          </g>
          {/* the words: a title, then rows or cards filling in */}
          <rect className="deck-line" x="22" y="22" width="44" height="5" rx="2.5" fill={colour} fillOpacity="0.7" />
          <rect className="deck-line" style={{ animationDelay: '0.3s' }} x="22" y="33" width="120" height="9" rx="3" fill="#1a1a1a" fillOpacity="0.75" />
          {kind === 'session'
            ? [0, 1, 2, 3].map((i) => (
                <g key={i} className="deck-line" style={{ animationDelay: `${0.6 + i * 0.25}s` }}>
                  <rect x="22" y={62 + i * 22} width="200" height="0.8" fill={colour} fillOpacity={i === 0 ? 0.8 : 0.2} />
                  <rect x="22" y={68 + i * 22} width="44" height="6" rx="3" fill={colour} fillOpacity="0.75" />
                  <rect x="78" y={68 + i * 22} width={104 - i * 12} height="6" rx="3" fill="#1a1a1a" fillOpacity="0.35" />
                  <rect x="196" y={68 + i * 22} width="26" height="6" rx="3" fill={colour} fillOpacity="0.3" />
                </g>
              ))
            : [0, 1, 2].map((i) => (
                <g key={i} className="deck-line" style={{ animationDelay: `${0.6 + i * 0.3}s` }}>
                  <rect x={22 + i * 68} y="62" width="60" height="9" fill={i === 1 ? gold : colour} />
                  <rect x={22 + i * 68} y="71" width="60" height="62" fill="#ffffff" stroke={colour} strokeOpacity="0.2" />
                  <rect x={28 + i * 68} y="78" width="46" height="5" rx="2.5" fill="#1a1a1a" fillOpacity="0.4" />
                  <rect x={28 + i * 68} y="87" width="34" height="5" rx="2.5" fill="#1a1a1a" fillOpacity="0.3" />
                </g>
              ))}
        </svg>
      </div>

      <ol aria-live="polite" className="flex flex-col gap-2.5">
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={step.label} className={cn('flex items-center gap-3 text-sm', done ? 'text-ink' : now ? 'font-medium text-ink' : 'text-[#9a9a9a]')}>
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : now ? 'border-2 border-primary' : 'border border-[#d4d4d4]')}>
                {done ? <CheckIcon className="check-pop size-3" /> : now ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
              </span>
              {step.label}
              {now && <span className="sr-only"> (in progress)</span>}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-[#7c7c7c]">This takes about a minute. The deck downloads when it is ready.</p>
    </div>
  );
}
