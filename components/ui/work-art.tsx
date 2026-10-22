'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Pictures of the work a long wait is spent on, in the report's motion (see .deck-art in
 * globals.css): parts still to come are a faint outline, the current stage moves, finished parts
 * hold still. Under them, the steps ticking off in turn.
 */

const PRIMARY = 'var(--color-primary)';
const GOLD = 'var(--color-gold)';
const LINE = 'var(--color-border)';
const INK = 'var(--color-ink)';
const SOFT = 'var(--color-primary-soft)';

type Motion = 'deck-draw' | 'deck-grow' | 'deck-line' | 'deck-glide' | 'deck-wave';
/** The class a part takes: moving while its stage is on, faint before, still after. */
const stage = (current: number) => (step: number, motion: Motion) => (step === current ? motion : step > current ? 'deck-ghost' : undefined);

/** A card holding a picture, with a progress bar under it when there is one. */
export function WorkCard({ children, progress, label }: { children: ReactNode; progress?: number; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-soft">
      <div className="p-3">{children}</div>
      {progress !== undefined && (
        <div className="h-1 bg-border" role="progressbar" aria-label={label ?? 'Progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full origin-left bg-primary transition-transform duration-700 ease-out" style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} />
        </div>
      )}
    </div>
  );
}

/** The steps beneath, done ones ticked, the current one pulsing, those to come faint. */
export function WorkSteps({ steps, current, detail }: { steps: string[]; current: number; detail?: ReactNode }) {
  return (
    <ol aria-live="polite" className="flex flex-col">
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={label} className="deck-step relative flex gap-3 pb-3 text-sm last:pb-0" style={{ animationDelay: `${i * 60}ms` }}>
            {i < steps.length - 1 && (
              <span className="absolute top-[22px] bottom-0.5 left-2.5 w-px -translate-x-1/2 bg-border" aria-hidden>
                <span className={cn('block h-full origin-top bg-primary transition-transform duration-[var(--motion-slow)]', done ? 'scale-y-100' : 'scale-y-0')} />
              </span>
            )}
            <span
              key={done ? 'done' : now ? 'now' : 'waiting'}
              className={cn('pop-in flex size-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : now ? 'border-2 border-primary' : 'border border-border')}
            >
              {done ? <CheckIcon className="check-pop size-3" /> : now ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
            </span>
            <span className={cn('pt-px', done ? 'text-ink-soft' : now ? 'font-medium text-ink' : 'text-placeholder')}>
              {label}
              {now && detail ? <span className="font-normal text-hint"> · {detail}</span> : null}
              {now && <span className="sr-only"> (in progress)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const glide = (gx: number, gy: number, delay = 0): CSSProperties => ({ ['--gx' as string]: `${gx}px`, ['--gy' as string]: `${gy}px`, animationDelay: `${delay}s` });

/**
 * A room's day put in order: the agenda's sessions across the top, captions under them; a block
 * filed under the wrong session glides to the right one (step 0), name tags join the voices (1),
 * the lines become cards (2), and the cards get their speakers, with a tick (3).
 */
export function AgendaArt({ current }: { current: number }) {
  const part = stage(current);
  const cols = [20, 118, 216];
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="The day being put in order" className="deck-art block h-auto w-full">
      <rect width="320" height="180" rx="6" fill="#ffffff" />
      {/* the agenda: three sessions */}
      {cols.map((x, i) => (
        <g key={x}>
          <rect x={x} y={12} width={84} height={18} rx={4} fill={i === 1 ? PRIMARY : SOFT} />
          <rect x={x + 8} y={19} width={44 - i * 6} height={4} rx={2} fill={i === 1 ? '#ffffff' : PRIMARY} fillOpacity={i === 1 ? 0.9 : 0.6} />
          <rect x={x} y={36} width={84} height={100} rx={4} fill="none" stroke={LINE} strokeDasharray="3 3" />
        </g>
      ))}
      {/* captions already where they belong */}
      {[0, 1].map((i) => (
        <rect key={`a${i}`} x={28} y={46 + i * 12} width={64 - i * 14} height={6} rx={3} fill={INK} fillOpacity={0.25} />
      ))}
      {[0, 1].map((i) => (
        <rect key={`c${i}`} x={224} y={46 + i * 12} width={60 - i * 10} height={6} rx={3} fill={INK} fillOpacity={0.25} />
      ))}
      {/* step 0: a block filed under the first session, gliding to the second */}
      {current <= 0 && (
        <g className={part(0, 'deck-glide')} style={glide(98, 0, 0.2)}>
          <rect x={26} y={74} width={70} height={22} rx={5} fill={GOLD} fillOpacity={0.25} stroke={GOLD} />
          <rect x={32} y={80} width={50} height={4} rx={2} fill={INK} fillOpacity={0.4} />
          <rect x={32} y={87} width={36} height={4} rx={2} fill={INK} fillOpacity={0.25} />
        </g>
      )}
      {current > 0 && (
        <g>
          <rect x={124} y={74} width={70} height={22} rx={5} fill={GOLD} fillOpacity={0.25} stroke={GOLD} />
          <rect x={130} y={80} width={50} height={4} rx={2} fill={INK} fillOpacity={0.4} />
          <rect x={130} y={87} width={36} height={4} rx={2} fill={INK} fillOpacity={0.25} />
        </g>
      )}
      {/* step 1: name tags beside the voices */}
      {[0, 1, 2].map((i) => (
        <g key={`n${i}`} className={part(1, 'deck-grow')} style={{ transformOrigin: `${cols[i]! + 10}px 108px`, animationDelay: `${i * 0.3}s` }}>
          <circle cx={cols[i]! + 10} cy={108} r={6} fill={i % 2 ? GOLD : PRIMARY} />
          <rect x={cols[i]! + 20} y={105} width={40} height={6} rx={3} fill={PRIMARY} fillOpacity={0.35} />
        </g>
      ))}
      {/* step 2: the lines become cards */}
      {[0, 1, 2].map((i) => (
        <g key={`k${i}`} className={part(2, 'deck-line')} style={{ animationDelay: `${i * 0.35}s` }}>
          <rect x={cols[i]! + 4} y={120} width={76} height={12} rx={3} fill="#ffffff" stroke={PRIMARY} strokeOpacity={0.5} />
          <rect x={cols[i]! + 9} y={124.5} width={44} height={3} rx={1.5} fill={PRIMARY} fillOpacity={0.6} />
        </g>
      ))}
      {/* step 3: who said it, and done */}
      {[0, 1, 2].map((i) => (
        <circle key={`w${i}`} className={part(3, 'deck-grow')} style={{ transformOrigin: `${cols[i]! + 70}px 126px`, animationDelay: `${i * 0.3}s` }} cx={cols[i]! + 70} cy={126} r={4} fill={GOLD} />
      ))}
      <g className={part(3, 'deck-grow')} style={{ transformOrigin: '160px 158px', animationDelay: '1s' }}>
        <circle cx={160} cy={158} r={10} fill={PRIMARY} />
        <path d="M155 158.5 L158.5 162 L165 155" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A stream re-captioned: the video's sound (0) becomes words (1) that drop into the sessions (2). */
export function RecaptionArt({ current }: { current: number }) {
  const part = stage(current);
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="A recording being re-captioned" className="deck-art block h-auto w-full">
      <rect width="320" height="180" rx="6" fill="#ffffff" />
      {/* the video */}
      <rect x={16} y={34} width={92} height={60} rx={6} fill={INK} fillOpacity={0.85} />
      <path d="M55 52 L71 64 L55 76 Z" fill="#ffffff" />
      <rect x={16} y={100} width={92} height={3} rx={1.5} fill={LINE} />
      <rect className={part(0, 'deck-line')} x={16} y={100} width={58} height={3} rx={1.5} fill="#e11d48" />
      {/* step 0: its sound */}
      {Array.from({ length: 11 }, (_, i) => (
        <rect key={i} className={part(0, 'deck-wave')} style={{ animationDelay: `${i * 0.08}s` }} x={124 + i * 7} y={48 + (i % 3) * 4} width={4} height={32 - (i % 3) * 8} rx={2} fill={GOLD} />
      ))}
      <path className={part(0, 'deck-draw')} d="M110 64 C116 64 118 64 122 64" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" pathLength="100" />
      {/* step 1: words */}
      <path className={part(1, 'deck-draw')} d="M204 64 C212 64 214 64 220 64" fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" pathLength="100" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className={part(1, 'deck-line')} style={{ animationDelay: `${i * 0.3}s` }}>
          <circle cx={230} cy={40 + i * 16} r={4} fill={i % 2 ? GOLD : PRIMARY} />
          <rect x={238} y={38 + i * 16} width={62 - (i % 3) * 12} height={4} rx={2} fill={INK} fillOpacity={0.4} />
        </g>
      ))}
      {/* step 2: into the sessions */}
      {[0, 1, 2].map((i) => (
        <g key={`s${i}`} className={part(2, 'deck-grow')} style={{ transformOrigin: `${60 + i * 100}px 146px`, animationDelay: `${i * 0.35}s` }}>
          <rect x={20 + i * 100} y={128} width={80} height={36} rx={5} fill={SOFT} />
          <rect x={28 + i * 100} y={136} width={48} height={4} rx={2} fill={PRIMARY} fillOpacity={0.7} />
          <rect x={28 + i * 100} y={145} width={60} height={3} rx={1.5} fill={INK} fillOpacity={0.3} />
          <rect x={28 + i * 100} y={152} width={40} height={3} rx={1.5} fill={INK} fillOpacity={0.3} />
        </g>
      ))}
    </svg>
  );
}

/** Lines of one session moving to the one they belong to. */
export function MoveArt() {
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label="Captions moving to the right session" className="deck-art block h-auto w-full">
      <rect width="320" height="110" rx="6" fill="#ffffff" />
      {[20, 196].map((x, i) => (
        <g key={x}>
          <rect x={x} y={12} width={104} height={16} rx={4} fill={i ? PRIMARY : SOFT} />
          <rect x={x + 8} y={18} width={52} height={4} rx={2} fill={i ? '#ffffff' : PRIMARY} fillOpacity={0.8} />
          <rect x={x} y={34} width={104} height={64} rx={4} fill="none" stroke={LINE} strokeDasharray="3 3" />
        </g>
      ))}
      <g className="deck-glide" style={glide(176, 0)}>
        <rect x={28} y={48} width={88} height={34} rx={5} fill={GOLD} fillOpacity={0.25} stroke={GOLD} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={34} y={54 + i * 8} width={68 - i * 12} height={4} rx={2} fill={INK} fillOpacity={0.4} />
        ))}
      </g>
    </svg>
  );
}

/** A day's sessions gathered into one file. */
export function PagesArt({ moving = true }: { moving?: boolean }) {
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label="Every session gathered into one transcript" className="deck-art block h-auto w-full">
      <rect width="320" height="110" rx="6" fill="#ffffff" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className={moving ? 'deck-glide' : undefined} style={glide(184 - i * 38, 6 - i * 2, i * 0.25)}>
          <rect x={20 + i * 38} y={20 + i * 2} width={44} height={60} rx={4} fill="#ffffff" stroke={i % 2 ? GOLD : PRIMARY} />
          <rect x={26 + i * 38} y={28 + i * 2} width={28} height={4} rx={2} fill={i % 2 ? GOLD : PRIMARY} fillOpacity={0.7} />
          {[0, 1, 2, 3].map((j) => (
            <rect key={j} x={26 + i * 38} y={38 + i * 2 + j * 8} width={32 - (j % 2) * 8} height={3} rx={1.5} fill={INK} fillOpacity={0.3} />
          ))}
        </g>
      ))}
      <rect x={196} y={14} width={60} height={80} rx={5} fill="none" stroke={LINE} strokeDasharray="3 3" />
    </svg>
  );
}

/** Night over the venue: a moon and stars, for the overnight tidy. */
export function MoonArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('deck-art shrink-0', className)}>
      <rect width="48" height="48" rx="12" fill={PRIMARY} />
      <path d="M30 13a12 12 0 1 0 5 21A10 10 0 0 1 30 13Z" fill={GOLD} />
      {[
        [12, 12, 0],
        [38, 18, 0.6],
        [15, 34, 1.2],
        [34, 38, 1.8],
      ].map(([x, y, d]) => (
        <circle key={`${x}-${y}`} className="deck-twinkle" style={{ animationDelay: `${d}s` }} cx={x} cy={y} r={1.6} fill="#ffffff" />
      ))}
    </svg>
  );
}
