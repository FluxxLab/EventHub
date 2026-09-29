'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api/client';
import { openCaptureSocket, useRealtimeEvents, useRealtimeSocket } from '@/lib/api/realtime';
import {
  EMPTY_FEED,
  peakDb,
  mergeCaption,
  parseSourceKey,
  seedFeed,
  sourceKey,
  type Caption,
  type DeskInput,
  type Feed,
  type RecentCaption,
} from '@/lib/captions/captions';
import { RoomCapture, type RoomState } from '@/lib/captions/room-capture';
import { DEMO_MODE } from '@/lib/demo';
import type { Session } from '@/lib/programme/programme';

const LIVE = ['captions', 'live-sessions'] as const;

const DEMO_LIVE = [
  { id: 'demo-live-1', title: 'Opening plenary: inclusion that scales', room: 'Main Hall' },
  { id: 'demo-live-2', title: 'Digital IDs and the last mile', room: 'Hall A' },
] as Session[];
const DEMO_LINES = [
  'Good morning everyone, and welcome to the summit.',
  'This year we want to talk about inclusion that actually scales.',
  'Not pilots that end with the funding, but systems that last.',
  'Let me start with a number that surprised our own team.',
  'One in three women in the survey had never held a bank account.',
];

/** Sessions live right now, refreshed as soon as one starts or ends anywhere. */
export function useLiveSessions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: LIVE });
  useRealtimeEvents({ 'session:status': refresh });
  return useQuery({
    queryKey: LIVE,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO_LIVE) : api.get<Session[]>('/sessions/live', undefined, signal)),
    refetchInterval: 30_000,
  });
}

/**
 * A live session's English captions: recent history first, then every line as it is spoken. Mount
 * one per session (key the component by session id), so a new session starts from an empty feed.
 * Joining the caption room counts this console as one caption listener.
 */
export function useCaptionFeed(sessionId: string) {
  const [feed, setFeed] = useState<Feed>(EMPTY_FEED);
  const socket = useRealtimeSocket();

  useEffect(() => {
    let cancelled = false;
    if (DEMO_MODE) {
      let seq = 0;
      const timer = setInterval(() => {
        const text = DEMO_LINES[seq % DEMO_LINES.length]!;
        seq += 1;
        const at = new Date().toISOString();
        setFeed((f) => mergeCaption(f, { text: text.slice(0, Math.ceil(text.length / 2)), isFinal: false, at, seq, speaker: 0 }));
        setTimeout(() => !cancelled && setFeed((f) => mergeCaption(f, { text, isFinal: true, at, seq, speaker: seq % 4 === 0 ? 1 : 0 })), 900);
      }, 2200);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }

    void api
      .get<RecentCaption[]>(`/captions/${sessionId}/captions`, { language: 'en' })
      .then((recent) => !cancelled && setFeed((f) => seedFeed(f, recent)))
      .catch(() => undefined); // catch-up is a nicety; the live stream still arrives

    if (!socket) return () => void (cancelled = true);
    const onCaption = (payload: Caption & { sessionId: string; language?: string }) => {
      if (payload.sessionId === sessionId && (payload.language ?? 'en') === 'en') setFeed((f) => mergeCaption(f, payload));
    };
    const onCleared = (payload: { sessionId: string }) => payload.sessionId === sessionId && setFeed(EMPTY_FEED);
    const join = () => socket.emit('captions:join', sessionId);
    socket.on('caption', onCaption);
    socket.on('captions:cleared', onCleared);
    socket.on('connect', join); // rejoin after a reconnect
    if (socket.connected) join();
    return () => {
      cancelled = true;
      socket.off('caption', onCaption);
      socket.off('captions:cleared', onCleared);
      socket.off('connect', join);
      socket.emit('captions:leave', sessionId);
    };
  }, [sessionId, socket]);

  return feed;
}

/** Clears a session's captions for everyone (the transcript is kept), and downloads the transcript. */
export function useCaptionActions(sessionId: string) {
  const clear = useMutation({
    mutationFn: () => (DEMO_MODE ? Promise.resolve({ deleted: 0 }) : api.delete<{ deleted: number }>(`/captions/${sessionId}/captions`)),
  });
  const exportTranscript = useMutation({
    mutationFn: async ({ format, title }: { format: 'csv' | 'txt'; title: string }) => {
      const text = DEMO_MODE ? DEMO_LINES.join('\n') : await api.getText(`/captions/${sessionId}/transcript/export`, { format });
      const url = URL.createObjectURL(new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^\w-]+/g, '-').slice(0, 60)}-transcript.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  return { clear, exportTranscript };
}


/* -------------------------------------------------------------- sound desk */

type OpenInput = { input: DeskInput; stream: MediaStream; splitter: ChannelSplitterNode; analysers: AnalyserNode[] };
type Running = { capture: RoomCapture; tap: GainNode };

/** A channel on the meter: the current peak and the highest in the last moment, both in dBFS. */
export type ChannelLevel = { db: number; hold: number };
const HOLD_MS = 1500;

/** Whether the browser lets this site use audio inputs; 'unknown' where the browser will not say. */
export type MicPermission = 'prompt' | 'granted' | 'denied' | 'unknown';

function useMicPermission(): [MicPermission, (p: MicPermission) => void] {
  const [state, setState] = useState<MicPermission>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const read = () => status && setState(status.state as MicPermission);
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        read();
        s.addEventListener('change', read);
      })
      .catch(() => undefined);
    return () => status?.removeEventListener('change', read);
  }, []);
  return [state, setState];
}

/** Browser aliases for another device; opening them would list the same channels twice. */
const ALIASES = new Set(['default', 'communications']);

/**
 * The sound desk: one computer takes every room's audio from the venue's mixer (a multichannel
 * audio interface) and captions each room from its own channel. `connect` opens every audio input
 * with all its channels and meters each one for the sound check; `start` captures a room from a
 * channel, over a socket of its own, until `stop`.
 */
export function useSoundDesk() {
  const [inputs, setInputs] = useState<DeskInput[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, ChannelLevel>>({});
  const [permission, setPermission] = useMicPermission();
  const holds = useRef(new Map<string, { db: number; at: number }>());
  const [rooms, setRooms] = useState<Record<string, RoomState>>({});
  const ctx = useRef<AudioContext | null>(null);
  const opened = useRef(new Map<string, OpenInput>());
  const running = useRef(new Map<string, Running>());
  const frame = useRef(0);

  const setRoom = useCallback((room: string, state: RoomState | null) => {
    setRooms((all) => {
      const next = { ...all };
      if (state) next[room] = state;
      else delete next[room];
      return next;
    });
  }, []);

  const stop = useCallback(
    async (room: string) => {
      const r = running.current.get(room);
      if (!r) return;
      running.current.delete(room);
      r.tap.disconnect();
      setRoom(room, null);
      await r.capture.stop();
    },
    [setRoom],
  );

  const disconnect = useCallback(async () => {
    await Promise.all([...running.current.keys()].map(stop));
    cancelAnimationFrame(frame.current);
    opened.current.forEach((o) => o.stream.getTracks().forEach((t) => t.stop()));
    opened.current.clear();
    void ctx.current?.close();
    ctx.current = null;
    setInputs(null);
    setLevels({});
    holds.current.clear();
  }, [stop]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use audio inputs. Use Chrome or Edge.');
      // Asking once reveals the devices' names, which the list needs.
      (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && !ALIASES.has(d.deviceId));
      const audio = new AudioContext();
      ctx.current = audio;
      const found: DeskInput[] = [];
      for (const [i, device] of devices.entries()) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: device.deviceId ? { exact: device.deviceId } : undefined,
              channelCount: { ideal: 32 }, // every channel the interface offers, not a stereo mixdown
              // A mixer's output is already clean; the browser's voice processing would only damage it.
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          const channels = Math.max(1, stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1);
          const source = audio.createMediaStreamSource(stream);
          const splitter = audio.createChannelSplitter(channels);
          source.connect(splitter);
          const analysers = Array.from({ length: channels }, (_, channel) => {
            const analyser = audio.createAnalyser();
            analyser.fftSize = 512;
            splitter.connect(analyser, channel);
            return analyser;
          });
          const input = { deviceId: device.deviceId || `input-${i}`, label: device.label || `Audio input ${i + 1}`, channels };
          opened.current.set(input.deviceId, { input, stream, splitter, analysers });
          found.push(input);
        } catch {
          // A device in use elsewhere or unplugged mid-scan: list the rest.
        }
      }
      if (found.length === 0) throw new Error('No audio input could be opened. Check the interface is plugged in and not in use by another app.');
      setInputs(found);
      setPermission('granted');

      const buffer = new Uint8Array(512);
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 100) {
          last = t;
          const next: Record<string, ChannelLevel> = {};
          opened.current.forEach((o) =>
            o.analysers.forEach((a, channel) => {
              a.getByteTimeDomainData(buffer);
              const key = sourceKey(o.input.deviceId, channel);
              const db = peakDb(buffer);
              const held = holds.current.get(key);
              const hold = held && t - held.at < HOLD_MS && held.db >= db ? held : { db, at: t };
              holds.current.set(key, hold);
              next[key] = { db, hold: hold.db };
            }),
          );
          setLevels(next);
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (e) {
      await disconnect();
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setPermission('denied');
        return;
      }
      setError(
        e instanceof Error
            ? e.message
            : 'The audio inputs could not be opened.',
      );
    } finally {
      setConnecting(false);
    }
  }, [disconnect, setPermission]);

  const start = useCallback(
    async (room: string, source: string, diarise: boolean) => {
      const key = parseSourceKey(source);
      const input = key && opened.current.get(key.deviceId);
      if (!ctx.current || !key || !input || running.current.has(room)) return;
      // One channel, on its own, as a mono stream for this room's recorder.
      const tap = ctx.current.createGain();
      const out = ctx.current.createMediaStreamDestination();
      out.channelCount = 1;
      out.channelCountMode = 'explicit';
      input.splitter.connect(tap, key.channel);
      tap.connect(out);
      const capture = new RoomCapture(room, diarise, out.stream, DEMO_MODE ? null : openCaptureSocket(), (state) => {
        if (running.current.get(room)?.capture === capture) setRoom(room, state);
      });
      running.current.set(room, { capture, tap });
      await capture.start();
    },
    [setRoom],
  );

  // Leaving the page releases the interface and every room (the server lets a room go after 15 s).
  useEffect(() => () => void disconnect(), [disconnect]);

  return { permission, inputs, connecting, error, levels, rooms, connect, disconnect, start, stop };
}
