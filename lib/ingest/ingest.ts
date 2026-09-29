import type { TagTone } from '@/components/ui/tag';

/** How a room's venue stream reaches LiveKit: RTMPS (every encoder) or WHIP (OBS 30+, no transcoding). */
export type StreamInput = 'rtmp' | 'whip';
export type StreamState = 'inactive' | 'buffering' | 'publishing' | 'error' | 'complete';
export type CaptureSource = 'ingest' | 'desk';

/** `GET /ingest/rooms`: one venue room, its stream (never the key) and who captions it now. */
export type IngestRoom = {
  room: string;
  stream: { id: string; input: StreamInput; url: string; state: StreamState; diarise: boolean } | null;
  captioning: CaptureSource | null;
};

/** Returned once, on create and on rotate. */
export type StreamCredentials = { room: string; input: StreamInput; url: string; streamKey: string };

/** What the Audio streams table says about a room's stream. */
export function streamStatus(room: IngestRoom): { label: string; tone: TagTone; dot: boolean } {
  if (!room.stream) return { label: 'No stream', tone: 'gray', dot: false };
  switch (room.stream.state) {
    case 'publishing':
      return room.captioning === 'desk'
        ? { label: 'Receiving · desk has the room', tone: 'gold', dot: true }
        : { label: 'Receiving', tone: 'green', dot: true };
    case 'buffering':
      return { label: 'Connecting', tone: 'gold', dot: true };
    case 'error':
      return { label: 'Encoder error', tone: 'danger', dot: true };
    default:
      return { label: 'Waiting for encoder', tone: 'gray', dot: false };
  }
}

export const INPUT_LABEL: Record<StreamInput, string> = { rtmp: 'RTMPS', whip: 'WHIP' };

/**
 * The fields to type into the encoder, named as OBS and most hardware encoders name them. RTMP
 * takes a server and a stream key; WHIP takes an endpoint URL and the key as a bearer token.
 */
export function encoderFields(credentials: StreamCredentials): { label: string; value: string; secret: boolean }[] {
  return credentials.input === 'whip'
    ? [
        { label: 'WHIP server (URL)', value: credentials.url, secret: false },
        { label: 'Bearer token', value: credentials.streamKey, secret: true },
      ]
    : [
        { label: 'Server (URL)', value: credentials.url, secret: false },
        { label: 'Stream key', value: credentials.streamKey, secret: true },
      ];
}

/** A one-line test from any laptop with ffmpeg: streams a recording into the room, audio only. */
export function testCommand(credentials: StreamCredentials): string | null {
  if (credentials.input !== 'rtmp') return null;
  const target = `${credentials.url.replace(/\/+$/, '')}/${credentials.streamKey}`;
  return `ffmpeg -re -i panel-recording.mp4 -vn -c:a aac -b:a 128k -ar 48000 -f flv "${target}"`;
}

/** The room's source for Live ops and the Sound desk, in words. */
export const SOURCE_LABEL: Record<CaptureSource, string> = { ingest: 'Venue stream', desk: 'Sound desk' };
