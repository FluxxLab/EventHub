import { describe, expect, it } from 'vitest';

import { encoderFields, streamStatus, testCommand, type IngestRoom, type StreamCredentials } from '@/lib/ingest/ingest';

const room = (over: Partial<IngestRoom> = {}): IngestRoom => ({
  room: 'Main Hall',
  stream: { id: 'IN_1', input: 'rtmp', url: 'rtmps://pic.livekit.cloud/x', state: 'publishing', diarise: true },
  captioning: 'ingest',
  ...over,
});

describe('streamStatus', () => {
  it('reads each state for an organiser', () => {
    expect(streamStatus(room()).label).toBe('Receiving');
    expect(streamStatus(room({ captioning: 'desk' })).label).toBe('Receiving · desk has the room');
    expect(streamStatus(room({ stream: { ...room().stream!, state: 'error' } })).tone).toBe('danger');
    expect(streamStatus(room({ stream: { ...room().stream!, state: 'inactive' } })).label).toBe('Waiting for encoder');
    expect(streamStatus(room({ stream: null })).label).toBe('No stream');
  });
});

describe('encoder settings', () => {
  const rtmp: StreamCredentials = { room: 'Main Hall', input: 'rtmp', url: 'rtmps://pic.livekit.cloud/x/', streamKey: 'k3y' };

  it('names the fields as encoders do, and marks the key secret', () => {
    expect(encoderFields(rtmp)).toEqual([
      { label: 'Server (URL)', value: 'rtmps://pic.livekit.cloud/x/', secret: false },
      { label: 'Stream key', value: 'k3y', secret: true },
    ]);
    expect(encoderFields({ ...rtmp, input: 'whip' }).map((f) => f.label)).toEqual(['WHIP server (URL)', 'Bearer token']);
  });

  it('offers an ffmpeg test for RTMP only', () => {
    expect(testCommand(rtmp)).toContain('-vn -c:a aac');
    expect(testCommand(rtmp)).toContain('"rtmps://pic.livekit.cloud/x/k3y"');
    expect(testCommand({ ...rtmp, input: 'whip' })).toBeNull();
  });
});
