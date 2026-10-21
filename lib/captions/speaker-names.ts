'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeEvents } from '@/lib/api/realtime';
import { paragraphs, speakerLabel, type Caption } from '@/lib/captions/captions';
import { DEMO_MODE } from '@/lib/demo';
import type { Session } from '@/lib/programme/programme';

/**
 * Who a voice is, learnt from what they said ("Good morning, I'm Amina Bello from…") or typed
 * in by an operator. A binding names the caption lines of its session spoken by that voice
 * (`speaker`: the diarised number, 0-based; `mic`: the mic, 1-based) from `fromAt` until `toAt`.
 * Applied bindings (auto, confirmed) name lines; a suggestion waits for an operator's yes or no.
 */
export type SpeakerName = {
  id: string;
  sessionId: string;
  kind: 'speaker' | 'mic';
  key: number;
  name: string;
  organisation: string | null;
  speakerId: string | null;
  status: 'auto' | 'suggested' | 'confirmed' | 'rejected';
  source: 'introduction' | 'operator' | 'review';
  /** The line they introduced themselves in. */
  evidence: string | null;
  fromAt: string;
  toAt: string | null;
  createdAt: string;
};

/** A resolved name on a caption line. */
export type Named = { name: string; organisation: string | null };

/** The edition's setting: who may be named from an introduction without an operator's say-so. */
export type SpeakerNaming = 'off' | 'programme' | 'everyone';
export const SPEAKER_NAMING_OPTIONS: { value: SpeakerNaming; label: string }[] = [
  { value: 'programme', label: 'Programmed speakers only' },
  { value: 'everyone', label: 'Everyone, as suggestions' },
  { value: 'off', label: 'Off' },
];
export const DEFAULT_SPEAKER_NAMING: SpeakerNaming = 'programme';

export const isApplied = (b: Pick<SpeakerName, 'status'>) => b.status === 'auto' || b.status === 'confirmed';
export const isSuggested = (b: Pick<SpeakerName, 'status'>) => b.status === 'suggested';
/** Learnt from the audio rather than typed in. */
export const isHeard = (b: Pick<SpeakerName, 'source'>) => b.source === 'introduction' || b.source === 'review';

/** "Mic 2" or "Speaker 3" for a binding's voice. */
export const bindingLabel = (b: Pick<SpeakerName, 'kind' | 'key'>) => (b.kind === 'mic' ? `Mic ${b.key}` : `Speaker ${b.key + 1}`);

/** A line's voice with no name: "Mic 2", else "Speaker 3", else null. */
export const labelOf = (line: Pick<Caption, 'mic' | 'speaker'>): string | null => (line.mic != null ? `Mic ${line.mic}` : speakerLabel(line.speaker));

/** Whether a binding covers a line: same voice, and said between `fromAt` and `toAt`. */
export function covers(b: SpeakerName, line: Pick<Caption, 'mic' | 'speaker' | 'at'>): boolean {
  const key = b.kind === 'mic' ? line.mic : line.speaker;
  if (key == null || key !== b.key) return false;
  const at = Date.parse(line.at);
  return at >= Date.parse(b.fromAt) && (b.toAt == null || at < Date.parse(b.toAt));
}

/** The applied binding naming a line, the newest where two overlap; a mic binding over a speaker one. */
export function bindingFor(line: Pick<Caption, 'mic' | 'speaker' | 'at'>, bindings: SpeakerName[]): SpeakerName | null {
  const matches = bindings.filter((b) => isApplied(b) && covers(b, line));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => (a.kind === b.kind ? Date.parse(b.fromAt) - Date.parse(a.fromAt) : a.kind === 'mic' ? -1 : 1))[0]!;
}

/**
 * Who said a line: the name the server sent with it, else the operator's label on its mic
 * (Captions > Mics), else the applied binding for its voice at that time.
 */
export function nameFor(line: Pick<Caption, 'mic' | 'speaker' | 'at' | 'name'> & { organisation?: string | null }, bindings: SpeakerName[], micLabels: Record<number, Named> = {}): Named | null {
  if (line.name) return { name: line.name, organisation: line.organisation ?? null };
  const onMic = line.mic != null ? micLabels[line.mic] : undefined;
  if (onMic) return onMic;
  const b = bindingFor(line, bindings);
  return b ? { name: b.name, organisation: b.organisation } : null;
}

/** A `captions:named` or `captions:suggested` event folded into the list: replaced, added, or (rejected) removed. */
export function applyNamed(bindings: SpeakerName[], event: SpeakerName): SpeakerName[] {
  const rest = bindings.filter((b) => b.id !== event.id);
  if (event.status === 'rejected') return rest;
  return bindings.some((b) => b.id === event.id) ? bindings.map((b) => (b.id === event.id ? event : b)) : [...rest, event];
}

/** The operator's names on a session's mics (Captions > Mics), by mic number. */
export function micLabelsOf(session: Pick<Session, 'mics' | 'speakers'>): Record<number, Named> {
  const out: Record<number, Named> = {};
  for (const mic of session.mics ?? []) {
    const speaker = mic.speakerId ? session.speakers?.find((s) => s.id === mic.speakerId) : undefined;
    if (speaker) out[mic.mic] = { name: speaker.name, organisation: speaker.organisation };
    else if (mic.label) out[mic.mic] = { name: mic.label, organisation: null };
  }
  return out;
}

/** A paragraph's voice: its label (the name, else "Speaker 2"), the name if any, and the binding that heard it. */
export type Voice = { label: string | null; named: Named | null; binding: SpeakerName | null };

export function voiceOf(line: Caption & { organisation?: string | null }, bindings: SpeakerName[], micLabels: Record<number, Named> = {}): Voice {
  const named = nameFor(line, bindings, micLabels);
  const match = bindingFor(line, bindings);
  // the binding is credited only when it is what named the line (the server names from it too)
  const binding = named && match && match.name === named.name ? match : null;
  return { label: named?.name ?? labelOf(line), named, binding };
}

/** The feed as paragraphs by who is speaking, with voices named: lines by one voice merge once it is named. */
export function namedParagraphs(lines: Caption[], bindings: SpeakerName[], micLabels: Record<number, Named> = {}, gapMs?: number): { voice: Voice; at: string; lines: Caption[] }[] {
  return paragraphs(lines, gapMs, (line) => voiceOf(line, bindings, micLabels).label).map((p) => ({ voice: voiceOf(p.lines[0]!, bindings, micLabels), at: p.at, lines: p.lines }));
}

/** The newest applied binding heard on a mic, for "Heard: Dr Amina Bello" beside its name field. */
export function heardOnMic(bindings: SpeakerName[], mic: number): SpeakerName | null {
  return bindings.filter((b) => b.kind === 'mic' && b.key === mic && isApplied(b) && isHeard(b)).sort((a, b) => b.fromAt.localeCompare(a.fromAt))[0] ?? null;
}

/** The session's voices (diarised speakers) that have a name or a suggestion, by speaker number. */
export const voices = (bindings: SpeakerName[]) => bindings.filter((b) => b.kind === 'speaker' && b.status !== 'rejected').sort((a, b) => a.key - b.key || a.fromAt.localeCompare(b.fromAt));

/* ---------------------------------------------------------------------- demo */

const DEMO_FROM = '2020-01-01T00:00:00.000Z';
const demo = (sessionId: string, n: number, over: Partial<SpeakerName>): SpeakerName => ({
  id: `${sessionId}-name-${n}`,
  sessionId,
  kind: 'speaker',
  key: 0,
  name: '',
  organisation: null,
  speakerId: null,
  status: 'auto',
  source: 'introduction',
  evidence: null,
  fromAt: DEMO_FROM,
  toAt: null,
  createdAt: DEMO_FROM,
  ...over,
});
const demoSeed = (sessionId: string): SpeakerName[] => [
  demo(sessionId, 1, {
    key: 0,
    name: 'Amina Yusuf',
    organisation: 'Policy Innovation Centre',
    speakerId: 's1',
    evidence: 'Good morning everyone, I am Amina Yusuf from the Policy Innovation Centre.',
  }),
  demo(sessionId, 2, { kind: 'mic', key: 1, name: 'Dr Amina Bello', organisation: 'Federal Ministry of Health', evidence: 'Thank you. I am Dr Amina Bello, Federal Ministry of Health.' }),
];
const demoSuggestion = (sessionId: string): SpeakerName =>
  demo(sessionId, 3, {
    key: 1,
    name: 'Chidi Okoro',
    organisation: 'Paystack',
    status: 'suggested',
    evidence: 'Hi, Chidi Okoro here, I lead payments policy at Paystack.',
    createdAt: new Date().toISOString(),
  });
// kept across remounts and refetches, so a decision in one tab holds in the other
const demoStore = new Map<string, SpeakerName[]>();
const demoSuggested = new Set<string>();
const demoList = (sessionId: string) => {
  if (!demoStore.has(sessionId)) demoStore.set(sessionId, demoSeed(sessionId));
  return demoStore.get(sessionId)!;
};
const demoSet = (sessionId: string, list: SpeakerName[]) => void demoStore.set(sessionId, list);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** How long after the monitor opens the demo suggestion "arrives". */
const DEMO_SUGGEST_MS = 6000;

/* ---------------------------------------------------------------------- hook */

const key = (sessionId: string | undefined) => ['admin', 'speaker-names', sessionId ?? 'none'] as const;

export type NameVoiceBody = { kind: SpeakerName['kind']; key: number; name: string; organisation?: string | null; speakerId?: string | null; fromAt?: string };
export type NameChange = { name?: string; organisation?: string | null; speakerId?: string | null };

/**
 * A session's speaker names (`GET /sessions/:id/speaker-names`), kept current from the caption
 * room's `captions:named` and `captions:suggested` events (the monitor joins the room), with the
 * operator's decisions applied on screen before the server answers.
 */
export function useSpeakerNames(sessionId: string | undefined) {
  const client = useQueryClient();
  const queryKey = key(sessionId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoList(sessionId!)) : api.get<SpeakerName[]>(`/sessions/${sessionId}/speaker-names`, undefined, signal)),
    enabled: !!sessionId,
  });
  const update = (fn: (was: SpeakerName[]) => SpeakerName[]) => client.setQueryData<SpeakerName[]>(queryKey, (was) => fn(was ?? []));
  const snapshot = () => client.getQueryData<SpeakerName[]>(queryKey);
  const restore = (before: SpeakerName[] | undefined) => client.setQueryData(queryKey, before);

  const onEvent = (payload: unknown) => {
    const event = payload as SpeakerName;
    if (event?.sessionId === sessionId) update((was) => applyNamed(was, event));
  };
  useRealtimeEvents({ 'captions:named': onEvent, 'captions:suggested': onEvent });

  // demo: a suggestion arrives a moment after the first look, once a session
  useEffect(() => {
    if (!DEMO_MODE || !sessionId || demoSuggested.has(sessionId)) return;
    const timer = setTimeout(() => {
      if (demoSuggested.has(sessionId)) return;
      demoSuggested.add(sessionId);
      const suggestion = demoSuggestion(sessionId);
      demoSet(sessionId, applyNamed(demoList(sessionId), suggestion));
      client.setQueryData<SpeakerName[]>(key(sessionId), (was) => applyNamed(was ?? [], suggestion));
    }, DEMO_SUGGEST_MS);
    return () => clearTimeout(timer);
  }, [client, sessionId]);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: NameChange & { status?: 'confirmed' | 'rejected' } }) => {
      if (!DEMO_MODE) return api.patch<SpeakerName>(`/speaker-names/${id}`, body);
      await wait(300);
      const was = demoList(sessionId!).find((b) => b.id === id);
      if (!was) throw new Error('That name is no longer there.');
      const saved: SpeakerName = { ...was, ...body, status: body.status ?? (was.status === 'suggested' ? 'confirmed' : was.status) };
      demoSet(sessionId!, applyNamed(demoList(sessionId!), saved));
      return saved;
    },
    onMutate: ({ id, body }) => {
      const before = snapshot();
      update((was) => (body.status === 'rejected' ? was.filter((b) => b.id !== id) : was.map((b) => (b.id === id ? { ...b, ...body } : b))));
      return { before };
    },
    onError: (_e, _v, ctx) => restore(ctx?.before),
    onSuccess: (saved) => update((was) => applyNamed(was, saved)),
  });

  const create = useMutation({
    mutationFn: async (body: NameVoiceBody) => {
      if (!DEMO_MODE) return api.post<SpeakerName>(`/sessions/${sessionId}/speaker-names`, body);
      await wait(300);
      const saved = demo(sessionId!, Date.now(), {
        ...body,
        organisation: body.organisation ?? null,
        speakerId: body.speakerId ?? null,
        status: 'confirmed',
        source: 'operator',
        fromAt: body.fromAt ?? DEMO_FROM,
        createdAt: new Date().toISOString(),
      });
      demoSet(sessionId!, applyNamed(demoList(sessionId!), saved));
      return saved;
    },
    onMutate: (body) => {
      const before = snapshot();
      const tempId = `pending-${Date.now()}`;
      const now = new Date().toISOString();
      update((was) => [
        ...was,
        {
          id: tempId,
          sessionId: sessionId!,
          kind: body.kind,
          key: body.key,
          name: body.name,
          organisation: body.organisation ?? null,
          speakerId: body.speakerId ?? null,
          status: 'confirmed',
          source: 'operator',
          evidence: null,
          fromAt: body.fromAt ?? now,
          toAt: null,
          createdAt: now,
        },
      ]);
      return { before, tempId };
    },
    onError: (_e, _v, ctx) => restore(ctx?.before),
    onSuccess: (saved, _body, ctx) =>
      update((was) =>
        applyNamed(
          was.filter((b) => b.id !== ctx?.tempId),
          saved,
        ),
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/speaker-names/${id}`);
      await wait(300);
      demoSet(
        sessionId!,
        demoList(sessionId!).filter((b) => b.id !== id),
      );
    },
    onMutate: (id) => {
      const before = snapshot();
      update((was) => was.filter((b) => b.id !== id));
      return { before };
    },
    onError: (_e, _v, ctx) => restore(ctx?.before),
  });

  const bindings = query.data ?? [];
  return {
    query,
    bindings,
    applied: bindings.filter(isApplied),
    suggested: bindings.filter(isSuggested),
    /** Yes to a suggestion, with the name as heard or as corrected. */
    confirm: (id: string, change?: NameChange) => patch.mutateAsync({ id, body: { status: 'confirmed', ...change } }),
    /** No to a suggestion (or a wrong auto name): it stops naming lines. */
    reject: (id: string) => patch.mutateAsync({ id, body: { status: 'rejected' } }),
    rename: (id: string, change: NameChange) => patch.mutateAsync({ id, body: change }),
    name: (body: NameVoiceBody) => create.mutateAsync(body),
    remove: (id: string) => remove.mutateAsync(id),
    pending: patch.isPending || create.isPending || remove.isPending,
    /** The id being decided or renamed, for a button to show it is working. */
    pendingId: patch.isPending ? patch.variables?.id : remove.isPending ? remove.variables : undefined,
  };
}

type ReviewJob = { state: 'waiting' | 'active' | 'completed' | 'failed'; added?: number; changed?: number; error?: string };
const POLL_MS = 3000;
/** How many polls before the console stops waiting on a recheck (10 minutes). */
const MAX_POLLS = 200;

/**
 * Rechecks a completed session's transcript for introductions (`POST /sessions/:id/speaker-names/review`),
 * following the job every 3 s until it is done, then refreshes the names.
 */
export function useRecheckNames(sessionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ added: number; changed: number }> => {
      if (DEMO_MODE) {
        await wait(1500);
        const found = demo(sessionId!, 4, {
          key: 2,
          name: 'Kwame Mensah',
          organisation: 'Bank of Industry',
          source: 'review',
          evidence: 'Kwame Mensah, Bank of Industry. Thanks for having me.',
          createdAt: new Date().toISOString(),
        });
        const had = demoList(sessionId!).some((b) => b.id === found.id);
        demoSet(sessionId!, applyNamed(demoList(sessionId!), found));
        return { added: had ? 0 : 1, changed: 0 };
      }
      return recheckNames(sessionId!);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: key(sessionId) }),
  });
}

/**
 * The review itself, for pages that run it outside the Captions page (Programme): starts it and
 * follows the job every 3 s until it is done.
 */
export async function recheckNames(sessionId: string): Promise<{ added: number; changed: number }> {
  if (DEMO_MODE) {
    await wait(1500);
    return { added: 1, changed: 0 };
  }
  const { jobId } = await api.post<{ jobId: string }>(`/sessions/${sessionId}/speaker-names/review`);
  for (let i = 0; i < MAX_POLLS; i++) {
    await wait(POLL_MS);
    const job = await api.get<ReviewJob>(`/speaker-names/review/${jobId}`);
    if (job.state === 'completed') return { added: job.added ?? 0, changed: job.changed ?? 0 };
    if (job.state === 'failed') throw new Error(job.error || 'The recheck failed.');
  }
  throw new Error('The recheck is still running. Check back in a few minutes.');
}
