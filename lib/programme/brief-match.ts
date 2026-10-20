/**
 * Matching a pile of brief files to the programme's sessions, so a folder of briefs can be dropped
 * in at once. A brief names its session near the top ("Session Brief: Academic Presentation /
 * What Africa Stands to Lose… / Prof. Victor Odumuyiwa… / Day Two, Thursday 22 October"), so each
 * session is scored on its title's words in the brief's opening, its speakers' names anywhere in
 * the brief, its day, and the file's name. Pure: the dialog shows the result for checking.
 */

import { readDate, readDayNumber } from '@/lib/programme/import';
import type { Session } from '@/lib/programme/programme';

/** Words that say nothing about which session it is. */
const STOP = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'in', 'on', 'to', 'with', 'at', 'by', 'from', 'its', 'it', 'is', 'as', 'or', 'into', 'how', 'what', 'who', 'session', 'brief', 'build', '2026', 'docx', 'pdf', 'final', 'v1', 'v2', 'draft',
]);

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const words = (s: string) => plain(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

/** Titles dropped from a speaker's name before looking for it ("Prof. Victor Odumuyiwa" is looked for as "victor odumuyiwa"). */
const HONORIFIC = /^(dr|prof|professor|mr|mrs|ms|barr|engr|hon|sir|chief|alhaji|rev|amb)\s+/;
const bareName = (name: string) => {
  let n = plain(name.replace(/\([^)]*\)/g, ' '));
  while (HONORIFIC.test(n)) n = n.replace(HONORIFIC, '');
  return n;
};

export type BriefMatch = {
  sessionId: string | null;
  /** How sure: `sure` is matched outright, `check` is a best guess to look at, `none` found nothing. */
  confidence: 'sure' | 'check' | 'none';
  /** What it matched on, for the reviewer: "title, 1 speaker, Day 2". */
  reason: string;
};

type Scored = { session: Session; score: number; reason: string[] };

/** The day a brief says it is on, from the first mention of a day or one of the event's dates. */
function briefDay(head: string, editionStartsAt: string, days: number): number | null {
  for (const line of head.split('\n')) {
    const n = readDayNumber(line);
    if (n) return n;
    const date = readDate(line, new Date(editionStartsAt).getFullYear());
    if (date) {
      for (let d = 1; d <= days; d += 1) {
        const at = new Date(editionStartsAt);
        at.setDate(at.getDate() + d - 1);
        const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
        if (iso === date) return d;
      }
    }
  }
  return null;
}

/** The session a brief is for, scored against every session in the programme. */
export function matchBrief(brief: { fileName: string; text: string }, sessions: Session[], editionStartsAt: string, days = 2): BriefMatch {
  const head = brief.text.slice(0, 1500);
  const headWords = new Set(words(head));
  const headPlain = ` ${plain(head)} `;
  const allPlain = ` ${plain(brief.text)} `;
  const fileWords = new Set(words(brief.fileName.replace(/\.[a-z0-9]+$/i, '')));
  const day = briefDay(head, editionStartsAt, days);

  const scored: Scored[] = sessions.map((session) => {
    const reason: string[] = [];
    let score = 0;
    const titleWords = [...new Set(words(session.title))];
    if (titleWords.length) {
      const whole = plain(session.title);
      const share = whole.length > 12 && headPlain.includes(` ${whole} `) ? 1 : titleWords.filter((w) => headWords.has(w)).length / titleWords.length;
      // a short title ("Registration") only counts when all of it is there
      const counted = titleWords.length < 3 && share < 1 ? 0 : share;
      score += counted * 6;
      if (counted >= 0.6) reason.push(counted === 1 ? 'title' : 'most of the title');
    }
    const named = session.speakers.filter((sp) => {
      const n = bareName(sp.name);
      return n.includes(' ') && allPlain.includes(` ${n} `);
    }).length;
    if (named) {
      score += Math.min(named, 3) * 1.5;
      reason.push(`${named} speaker${named === 1 ? '' : 's'}`);
    }
    const inFile = [...new Set([...words(session.title), ...session.speakers.flatMap((sp) => bareName(sp.name).split(' '))])].filter((w) => w.length > 3 && fileWords.has(w)).length;
    if (inFile) {
      score += Math.min(inFile, 3) * 0.8;
      reason.push('file name');
    }
    if (day !== null) {
      if (day === session.day) {
        score += 1;
        if (score > 1) reason.push(`Day ${day}`);
      } else score -= 2;
    }
    return { session, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < 2.5) return { sessionId: null, confidence: 'none', reason: 'No session matched' };
  const sure = best.score >= 5 && best.score - (next?.score ?? 0) >= 2;
  return { sessionId: best.session.id, confidence: sure ? 'sure' : 'check', reason: `Matched on ${best.reason.join(', ')}` };
}

/**
 * Every brief matched, and where two land on the same session the weaker one is set aside
 * (`sessionId: null`, to be chosen by hand), since a session keeps one brief.
 */
export function matchBriefs<T extends { fileName: string; text: string }>(briefs: T[], sessions: Session[], editionStartsAt: string, days = 2): (T & BriefMatch)[] {
  const rank = { sure: 2, check: 1, none: 0 } as const;
  const out = briefs.map((b) => ({ ...b, ...matchBrief(b, sessions, editionStartsAt, days) }));
  const taken = new Map<string, number>();
  out.forEach((m, i) => {
    if (!m.sessionId) return;
    const j = taken.get(m.sessionId);
    if (j === undefined) return void taken.set(m.sessionId, i);
    const loser = rank[out[j]!.confidence] >= rank[m.confidence] ? i : j;
    if (loser === j) taken.set(m.sessionId, i);
    out[loser] = { ...out[loser]!, sessionId: null, confidence: 'none', reason: 'Another file matched the same session' };
  });
  return out;
}
