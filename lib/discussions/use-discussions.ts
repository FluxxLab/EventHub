'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import { toCsv, withHidden, withKept, withShown, type ModComment, type Thread } from '@/lib/discussions/discussions';

const PAGE = 50;
const THREADS = ['admin', 'discussions', 'threads'] as const;

/** Which comments: one thread (or every thread, for the review queue), and which of them. */
export type CommentView = { sessionId: string | null; filter: 'all' | 'reported' | 'hidden' };
const commentsKey = (view: CommentView) => ['admin', 'discussions', 'comments', view.sessionId ?? 'all', view.filter] as const;

/* ------------------------------------------------------------------ demo data */

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const DEMO_THREADS: Thread[] = [
  { sessionId: 'd2', title: 'Digital IDs and the last mile', track: 'digital', type: 'panel', room: 'Hall A', comments: 5, flagged: 1, hidden: 0, lastAt: ago(4) },
  { sessionId: 'd1', title: 'Opening plenary: inclusion that scales', track: 'general', type: 'plenary', room: 'Main Hall', comments: 3, flagged: 0, hidden: 1, lastAt: ago(35) },
  { sessionId: 'd4', title: 'Women in trade finance', track: 'economic', type: 'roundtable', room: 'Hall B', comments: 0, flagged: 0, hidden: 0, lastAt: null },
  { sessionId: 'd5', title: 'Safe transport after dark', track: 'security', type: 'workshop', room: 'Hall A', comments: 0, flagged: 0, hidden: 0, lastAt: null },
];
const comment = (id: string, sessionId: string, authorName: string, authorOrganisation: string | null, body: string, over: Partial<ModComment> = {}): ModComment => ({
  id,
  sessionId,
  sessionTitle: DEMO_THREADS.find((t) => t.sessionId === sessionId)!.title,
  authorId: `a-${authorName}`,
  authorName,
  authorOrganisation,
  body,
  flagged: false,
  likes: 0,
  dislikes: 0,
  hiddenAt: null,
  createdAt: ago(10),
  ...over,
});
let demoComments: ModComment[] = [
  comment('c1', 'd2', 'Hauwa Bello', 'Women in Tech Africa', 'The point about agents in rural wards is the whole story. Enrolment centres close at 4pm, women finish market at 6.', { likes: 24, createdAt: ago(4) }),
  comment('c2', 'd2', 'Anonymous tester', null, 'This panel is a waste of time, total scam, click my link for free NIN registration!!!', { flagged: true, dislikes: 9, createdAt: ago(7) }),
  comment('c3', 'd2', 'Ibrahim Musa', 'Kano State Ministry of Women Affairs', 'We would welcome the data on the Kano pilot. Can the slides be shared?', { likes: 11, createdAt: ago(12) }),
  comment('c4', 'd2', 'Chioma Okafor', null, 'Does anyone know if the NIMC mobile units will visit IDP camps?', { likes: 6, dislikes: 1, createdAt: ago(18) }),
  comment('c5', 'd2', 'Samuel Adeyemi', 'Lagos Business School', 'Strong session. The cost figures per enrolment deserve a follow-up paper.', { likes: 3, createdAt: ago(25) }),
  comment('c6', 'd1', 'Ngozi Eze', 'UN Women Nigeria', 'Inclusion that scales has to mean budget lines, not pilots. Glad the Minister said it plainly.', { likes: 31, createdAt: ago(35) }),
  comment('c7', 'd1', 'Guest', null, 'Off-topic rant removed by moderators.', { flagged: true, hiddenAt: ago(30), createdAt: ago(40) }),
  comment('c8', 'd1', 'Kwame Mensah', null, 'Where can we find the commitments tracker mentioned at the end?', { likes: 8, createdAt: ago(50) }),
];
function demoPage(view: CommentView): ModComment[] {
  return demoComments
    .filter((c) => !view.sessionId || c.sessionId === view.sessionId)
    .filter((c) => (view.filter === 'reported' ? c.flagged && !c.hiddenAt : view.filter === 'hidden' ? !!c.hiddenAt : true));
}

/* ---------------------------------------------------------------------- hooks */

/** Every session's thread with its counts, refreshed every 30 s. */
export function useThreads(enabled: boolean) {
  return useQuery({
    queryKey: THREADS,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO_THREADS) : api.get<Thread[]>('/discussions/threads', undefined, signal)),
    enabled,
    refetchInterval: 30_000,
  });
}

/**
 * Comments for a view, newest first, 50 at a time ("Load older" fetches the next page by the
 * `before` cursor). Refreshed every 20 s: the moderation list spans sessions, and joining every
 * session's socket room to follow it live would be heavier than it is worth.
 */
export function useComments(view: CommentView, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: commentsKey(view),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (DEMO_MODE) return Promise.resolve(demoPage(view));
      return api.get<ModComment[]>(
        '/discussions/comments',
        {
          limit: PAGE,
          before: pageParam ?? undefined,
          sessionId: view.sessionId ?? undefined,
          flagged: view.filter === 'reported' ? true : undefined,
          hidden: view.filter === 'reported' ? 'exclude' : view.filter === 'hidden' ? 'only' : 'include',
        },
        signal,
      );
    },
    getNextPageParam: (last) => (last.length === PAGE ? last.at(-1)!.createdAt : null),
    enabled,
    refetchInterval: 20_000,
  });
}

/** One moderation action: shown at once across every list on screen, put back if the API refuses. */
function useModeration(path: 'hide' | 'unhide' | 'keep', change: (list: ModComment[], id: string) => ModComment[]) {
  const client = useQueryClient();
  const key = ['admin', 'discussions', 'comments'];
  return useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!DEMO_MODE) return api.patch(`/discussions/comments/${id}/${path}`);
      demoComments = change(demoComments, id);
      return Promise.resolve();
    },
    onMutate: async ({ id }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueriesData<InfiniteData<ModComment[]>>({ queryKey: key });
      client.setQueriesData<InfiniteData<ModComment[]>>({ queryKey: key }, (was) => (was ? { ...was, pages: was.pages.map((p) => change(p, id)) } : was));
      return { before };
    },
    onError: (_error: Error, _vars, context) => context?.before.forEach(([k, data]) => client.setQueryData(k, data)),
    // the thread counts (reported, hidden) change too
    onSettled: () => void client.invalidateQueries({ queryKey: ['admin', 'discussions'] }),
  });
}

/** Moderation (hide, unhide, keep = dismiss the report) and the thread export. */
export function useDiscussionActions() {
  const hide = useModeration('hide', (list, id) => withHidden(list, id));
  const unhide = useModeration('unhide', withShown);
  const keep = useModeration('keep', withKept);

  const exportThread = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      // JSON, not the CSV route: that one is sent without a CSV content type. The console
      // writes the CSV itself, quoted the same way.
      const rows = DEMO_MODE
        ? demoComments.filter((c) => c.sessionId === sessionId).map(({ createdAt, authorName, authorOrganisation, body, likes, dislikes, flagged, hiddenAt }) => ({ createdAt, authorName, authorOrganisation, body, likes, dislikes, flagged, hidden: !!hiddenAt }))
        : await api.get<Record<string, unknown>[]>(`/discussions/sessions/${sessionId}/comments/export`, { format: 'json' });
      const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^\w-]+/g, '-').slice(0, 60)}-discussion.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return rows.length;
    },
  });

  return { hide, unhide, keep, exportThread };
}

/* ------------------------------------------------------------------ discussion wall */

const wallKey = (sessionId: string | undefined) => ['admin', 'discussions', 'wall', sessionId ?? ''] as const;
const lockKey = (sessionId: string | undefined) => ['admin', 'discussions', 'lock', sessionId ?? ''] as const;

/** A comment as the socket sends it (`discussion:comment`); the API spells its time `createAt`. */
type LiveComment = { id: string; sessionId: string; authorId: string; authorName: string; authorOrganisation: string | null; body: string; createAt?: string; createdAt?: string };

/**
 * One session's discussion for a big screen: its comments (hidden ones left out by the API), new
 * comments and hides arriving over the socket the moment they happen, and whether the thread is
 * closed. Likes and dislikes are not pushed by the API, so the list is refetched every 5 s for them.
 */
export function useDiscussionWall(sessionId: string | undefined) {
  const client = useQueryClient();
  const socket = useRealtimeSocket();

  const comments = useQuery({
    queryKey: wallKey(sessionId),
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve(demoPage({ sessionId: sessionId!, filter: 'all' }).filter((c) => !c.hiddenAt)) : api.get<ModComment[]>('/discussions/comments', { sessionId, limit: PAGE, hidden: 'exclude' }, signal),
    enabled: !!sessionId,
    refetchInterval: 5_000,
  });
  const lock = useQuery({
    queryKey: lockKey(sessionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve({ locked: false }) : api.get<{ locked: boolean }>(`/discussions/sessions/${sessionId}/thread`, undefined, signal)),
    enabled: !!sessionId,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!sessionId) return;
    const add = (c: ModComment) => client.setQueryData<ModComment[]>(wallKey(sessionId), (was) => (was && !was.some((x) => x.id === c.id) ? [c, ...was] : was));

    if (DEMO_MODE) {
      // A lively room: likes trickle in, and now and then a new comment.
      let n = 0;
      const timer = setInterval(() => {
        const list = client.getQueryData<ModComment[]>(wallKey(sessionId)) ?? [];
        if (Math.random() < 0.35 || list.length === 0) {
          n += 1;
          add(comment(`live-${sessionId}-${n}`, list[0]?.sessionId ?? 'd2', 'Aisha Lawal', 'Delegate', 'Agree with the last speaker: the data has to be broken down by gender or we cannot see who is left out.', { createdAt: new Date().toISOString() }));
        } else {
          const pick = list[Math.floor(Math.random() * list.length)]!;
          client.setQueryData<ModComment[]>(wallKey(sessionId), list.map((c) => (c.id === pick.id ? { ...c, likes: c.likes + 1 } : c)));
        }
      }, 4000);
      return () => clearInterval(timer);
    }

    if (!socket) return;
    const handlers: Record<string, (payload: unknown) => void> = {
      'discussion:comment': (payload) => {
        const c = payload as LiveComment;
        if (c.sessionId !== sessionId) return;
        add({ id: c.id, sessionId: c.sessionId, sessionTitle: '', authorId: c.authorId, authorName: c.authorName, authorOrganisation: c.authorOrganisation, body: c.body, flagged: false, likes: 0, dislikes: 0, hiddenAt: null, createdAt: c.createAt ?? c.createdAt ?? new Date().toISOString() });
      },
      'discussion:hidden': (payload) => {
        const { commentId } = payload as { commentId: string };
        client.setQueryData<ModComment[]>(wallKey(sessionId), (was) => was?.filter((c) => c.id !== commentId));
      },
      'discussion:locked': (payload) => {
        const state = payload as { sessionId: string; locked: boolean };
        if (state.sessionId === sessionId) client.setQueryData(lockKey(sessionId), { locked: state.locked });
      },
    };
    const join = () => {
      socket.emit('discussions:join', sessionId);
      // anything missed while disconnected comes back with a fresh list
      void client.invalidateQueries({ queryKey: wallKey(sessionId) });
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    socket.on('connect', join);
    if (socket.connected) socket.emit('discussions:join', sessionId);
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      socket.off('connect', join);
      socket.emit('discussions:leave', sessionId);
    };
  }, [sessionId, socket, client]);

  return { comments, locked: lock.data?.locked ?? false };
}
