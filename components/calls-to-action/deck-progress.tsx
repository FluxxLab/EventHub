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

/** About how long a deck takes; the bar eases towards the end of it and waits there for the download. */
const EXPECTED_SECONDS = 60;

/**
 * While a deck is made, in steps: a small slide in the event's colour builds the way the deck does
 * (the words first, then the colours, the artwork, the layout). Parts still to come are a faint
 * outline, the current step's parts draw themselves over and over, finished parts hold still, and the
 * list beneath ticks each step off as the next takes over. Still for anyone whose device asks for
 * reduced motion.
 */
export function DeckProgress({ colour, kind }: { colour: string; kind: 'session' | 'day' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STEPS.reduce((at, step, i) => (seconds >= step.at ? i : at), 0);
  const progress = Math.min(95, Math.round((1 - Math.exp(-seconds / (EXPECTED_SECONDS / 2.5))) * 100));
  const gold = '#F5C400';
  // a part of the slide drawn in `step`: animating while that step runs, an outline before, still after
  const part = (step: number, motion: 'deck-draw' | 'deck-grow' | 'deck-line') => (step === current ? motion : step > current ? 'deck-ghost' : undefined);

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-soft">
        <div className="p-3">
          <svg viewBox="0 0 320 180" role="img" aria-label="The deck being designed" className="deck-art block h-auto w-full">
            <rect width="320" height="180" rx="6" fill="#ffffff" />
            {/* step 1, the words: a title */}
            <rect className={part(0, 'deck-line')} x="22" y="22" width="44" height="5" rx="2.5" fill={colour} fillOpacity="0.7" />
            <rect className={part(0, 'deck-line')} style={{ animationDelay: '0.3s' }} x="22" y="33" width="120" height="9" rx="3" fill="#1a1a1a" fillOpacity="0.75" />
            {/* step 2, the colours: forms grow in the corner */}
            <g className={part(1, 'deck-grow')} style={{ transformOrigin: '290px 40px' }}>
              <circle cx="290" cy="40" r="58" fill={colour} fillOpacity="0.18" />
            </g>
            <g className={part(1, 'deck-grow')} style={{ transformOrigin: '300px 30px', animationDelay: '0.4s' }}>
              <circle cx="300" cy="30" r="34" fill={colour} fillOpacity="0.55" />
            </g>
            <g className={part(1, 'deck-grow')} style={{ transformOrigin: '22px 168px', animationDelay: '0.8s' }}>
              <circle cx="22" cy="168" r="24" fill={gold} fillOpacity="0.5" />
            </g>
            {/* step 3, the artwork: arcs trace round the forms */}
            <path className={part(2, 'deck-draw')} d="M232 24 A62 62 0 0 1 300 104" fill="none" stroke={gold} strokeWidth="7" strokeLinecap="round" pathLength="100" />
            <path
              className={part(2, 'deck-draw')}
              style={{ animationDelay: '0.6s' }}
              d="M226 60 A78 78 0 0 0 290 122"
              fill="none"
              stroke={colour}
              strokeWidth="1.2"
              strokeDasharray="2 4"
              pathLength="100"
            />
            {/* step 4, the layout: the session's rows, or the day's cards */}
            {kind === 'session'
              ? [0, 1, 2, 3].map((i) => (
                  <g key={i} className={part(3, 'deck-line')} style={{ animationDelay: `${i * 0.25}s` }}>
                    <rect x="22" y={62 + i * 22} width="200" height="0.8" fill={colour} fillOpacity={i === 0 ? 0.8 : 0.2} />
                    <rect x="22" y={68 + i * 22} width="44" height="6" rx="3" fill={colour} fillOpacity="0.75" />
                    <rect x="78" y={68 + i * 22} width={104 - i * 12} height="6" rx="3" fill="#1a1a1a" fillOpacity="0.35" />
                    <rect x="196" y={68 + i * 22} width="26" height="6" rx="3" fill={colour} fillOpacity="0.3" />
                  </g>
                ))
              : [0, 1, 2].map((i) => (
                  <g key={i} className={part(3, 'deck-line')} style={{ animationDelay: `${i * 0.3}s` }}>
                    <rect x={22 + i * 68} y="62" width="60" height="9" fill={i === 1 ? gold : colour} />
                    <rect x={22 + i * 68} y="71" width="60" height="62" fill="#ffffff" stroke={colour} strokeOpacity="0.2" />
                    <rect x={28 + i * 68} y="78" width="46" height="5" rx="2.5" fill="#1a1a1a" fillOpacity="0.4" />
                    <rect x={28 + i * 68} y="87" width="34" height="5" rx="2.5" fill="#1a1a1a" fillOpacity="0.3" />
                  </g>
                ))}
          </svg>
        </div>
        {/* how far along, easing towards the end rather than promising a moment */}
        <div className="h-1 bg-border" role="progressbar" aria-label="Making the deck" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full origin-left bg-primary transition-transform duration-1000 ease-linear" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      </div>

      <ol aria-live="polite" className="flex flex-col">
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={step.label} className="deck-step relative flex gap-3 pb-3 text-sm last:pb-0" style={{ animationDelay: `${i * 60}ms` }}>
              {/* the line to the next step fills as this one finishes */}
              {i < STEPS.length - 1 && (
                <span className="absolute top-[22px] bottom-0.5 left-2.5 w-px -translate-x-1/2 bg-border" aria-hidden>
                  <span className={cn('block h-full origin-top bg-primary transition-transform duration-[var(--motion-slow)] ease-[var(--ease-standard)]', done ? 'scale-y-100' : 'scale-y-0')} />
                </span>
              )}
              <span
                // keyed by state, so each change plays its own entrance
                key={done ? 'done' : now ? 'now' : 'waiting'}
                className={cn('pop-in flex size-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : now ? 'border-2 border-primary' : 'border border-border')}
              >
                {done ? <CheckIcon className="check-pop size-3" /> : now ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
              </span>
              <span className={cn('pt-px transition-colors duration-[var(--motion-moderate)]', done ? 'text-ink-soft' : now ? 'font-medium text-ink' : 'text-placeholder')}>
                {step.label}
                {now && <span className="sr-only"> (in progress)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-hint">This takes about a minute. The deck downloads when it is ready.</p>
    </div>
  );
}
