import { z } from 'zod';

import type { SessionTrack } from '@/lib/programme/programme';

export type TopicVoting = 'pending' | 'open' | 'closed';

/** The result frozen when a topic's voting closed (`PitchTopic.result`). */
export type TopicTally = { topicId: string; counts: { entryId: string; votes: number }[]; voters: number };

export type PitchEntry = {
  id: string;
  topicId: string;
  innovatorName: string;
  country: string;
  track: SessionTrack;
  description: string;
  voteCount: number;
};

/** `GET /voting/topics`: a topic with its pitches (organisers see pending ones too). */
export type PitchTopic = {
  id: string;
  name: string;
  position: number;
  voting: TopicVoting;
  result: TopicTally | null;
  closedAt: string | null;
  createdAt: string;
  entries: PitchEntry[];
  voters: number;
};

/** The `voting` room's events. */
export type VotingEvent =
  | { type: 'voting:tally'; payload: TopicTally }
  | { type: 'voting:opened'; payload: { topicId: string } }
  | { type: 'voting:closed'; payload: TopicTally | null };

/** Running order: the API's `position`, then creation. */
export const sortTopics = (topics: PitchTopic[]) =>
  [...topics].sort((a, b) => a.position - b.position || Date.parse(a.createdAt) - Date.parse(b.createdAt));

/** Puts a tally's counts onto the topic's pitches (a pitch with no votes drops out of a tally, so it is 0). */
function withTally(topic: PitchTopic, tally: TopicTally): PitchTopic {
  const votes = new Map(tally.counts.map((c) => [c.entryId, c.votes]));
  return { ...topic, voters: tally.voters, entries: topic.entries.map((e) => ({ ...e, voteCount: votes.get(e.id) ?? 0 })) };
}

export function applyVotingEvent(topics: PitchTopic[], event: VotingEvent): PitchTopic[] {
  switch (event.type) {
    case 'voting:tally':
      return topics.map((t) => (t.id === event.payload.topicId && t.voting === 'open' ? withTally(t, event.payload) : t));
    case 'voting:opened':
      return topics.map((t) => (t.id === event.payload.topicId ? { ...t, voting: 'open' } : t));
    case 'voting:closed': {
      const tally = event.payload;
      if (!tally) return topics;
      return topics.map((t) => (t.id === tally.topicId ? { ...withTally(t, tally), voting: 'closed', result: tally, closedAt: t.closedAt ?? new Date().toISOString() } : t));
    }
  }
}

/** Pitches by votes (most first), ties in the order they presented. */
export function standings(topic: PitchTopic): PitchEntry[] {
  return topic.entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.voteCount - a.e.voteCount || a.i - b.i).map(({ e }) => e);
}

/** The winning pitch(es) of a closed topic, from its frozen result. Ties share the win; none without votes. */
export function winners(topic: PitchTopic): string[] {
  const counts = topic.voting === 'closed' && topic.result ? topic.result.counts : [];
  const top = Math.max(0, ...counts.map((c) => c.votes));
  return top === 0 ? [] : counts.filter((c) => c.votes === top).map((c) => c.entryId);
}

/** New positions after moving one topic up or down: a clean 0..n-1 run, only changed ones returned. */
export function moveTopic(topics: PitchTopic[], id: string, direction: -1 | 1): { id: string; position: number }[] {
  const order = sortTopics(topics);
  const i = order.findIndex((t) => t.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return [];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return order.flatMap((t, position) => (t.position === position ? [] : [{ id: t.id, position }]));
}

export const topicSchema = z.object({
  name: z.string().trim().min(1, 'Name the topic.').max(160, 'Keep it under 160 characters.'),
});
export type TopicForm = z.input<typeof topicSchema>;

/** The API's rules for a pitch (create-pitch-entry.dto.ts), checked first. */
export const pitchSchema = z.object({
  innovatorName: z.string().trim().min(2, 'Enter the innovator or team name.').max(255, 'Keep it under 255 characters.'),
  country: z.string().trim().min(2, 'Enter a country.').max(100, 'Keep it under 100 characters.'),
  track: z.string().min(1, 'Choose a track.'),
  description: z.string().trim().min(10, 'Describe the pitch in a sentence or two.').max(600, 'Keep it under 600 characters.'),
});
export type PitchForm = z.input<typeof pitchSchema>;

export const emptyPitch = (): PitchForm => ({ innovatorName: '', country: '', track: 'general', description: '' });
export const pitchFormOf = (e: PitchEntry): PitchForm => ({ innovatorName: e.innovatorName, country: e.country, track: e.track, description: e.description });
