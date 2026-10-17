'use client';

import { ArrowDownTrayIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, SignalSlashIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/ui/panel';
import { RowActions } from '@/components/ui/row-actions';
import { Spinner } from '@/components/ui/spinner';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { deskBackup, pieceDuration, pieceFilename, pieceLabel, sameDay, useDeskBackup, type BackupPiece } from '@/lib/captions/desk-recorder';

const hm = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "820 KB", "1.2 MB", "3.4 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** "38 min", "2 h 5 min". */
const formatMinutes = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/** Free space for this site, where the browser says (refreshed every minute). */
function useFreeSpace(): number | null {
  const [free, setFree] = useState<number | null>(null);
  useEffect(() => {
    const read = () =>
      navigator.storage
        ?.estimate?.()
        .then((e) => setFree(e.quota !== undefined && e.usage !== undefined ? e.quota - e.usage : null))
        .catch(() => undefined);
    void read();
    const timer = setInterval(read, 60_000);
    return () => clearInterval(timer);
  }, []);
  return free;
}

/** The time now, ticking every 15 s, for the length of pieces still recording. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

async function download(piece: BackupPiece) {
  const blob = (await deskBackup()?.blob(piece.id)) ?? new Blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pieceFilename(piece.room, piece.startedAt);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Backup recordings: each room the desk captures is also recorded on this computer, and the pieces
 * recorded while a room was offline are uploaded when the link returns, so the server can fill in
 * the captions that were missed. Lists today's pieces by room, with upload, download and delete.
 */
export function BackupPanel({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const backup = useDeskBackup();
  const toast = useToast();
  const now = useNow();
  const free = useFreeSpace();
  const [deleting, setDeleting] = useState<BackupPiece[] | null>(null);
  const [downloading, setDownloading] = useState(false);

  const today = useMemo(() => backup.pieces.filter((p) => sameDay(p.startedAt, now)), [backup.pieces, now]);
  const older = useMemo(() => backup.pieces.filter((p) => !sameDay(p.startedAt, now) && p.status !== 'recording' && p.status !== 'uploading'), [backup.pieces, now]);
  const byRoom = useMemo(() => {
    const groups = new Map<string, BackupPiece[]>();
    // newest first within a room
    [...today].reverse().forEach((p) => groups.set(p.room, [...(groups.get(p.room) ?? []), p]));
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [today]);
  const uploading = backup.pieces.some((p) => p.status === 'uploading');
  const finished = today.filter((p) => p.status !== 'recording');
  const recordedMs = today.reduce((sum, p) => sum + pieceDuration(p, now), 0);

  // Closing the tab mid-upload loses the upload (the recording stays): ask first.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  if (hideWhenEmpty && backup.pieces.length === 0 && backup.rooms.length === 0) return null;

  const summary = [
    backup.rooms.length ? `Recording a backup of ${backup.rooms.length} ${backup.rooms.length === 1 ? 'room' : 'rooms'} on this computer` : 'Each room is recorded on this computer while it runs',
    `${formatMinutes(recordedMs)} today`,
    free !== null ? `${formatBytes(free)} free` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const downloadAll = async () => {
    setDownloading(true);
    try {
      for (const piece of finished) {
        await download(piece);
        // a moment between files, so the browser takes each one
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      toast.push({ title: 'Download stopped', body: 'A recording could not be read. Try that one on its own.' });
    } finally {
      setDownloading(false);
    }
  };

  const confirmDelete = () => {
    deleting?.forEach((p) => void deskBackup()?.remove(p.id));
    setDeleting(null);
  };
  const notUploaded = deleting?.filter((p) => p.status !== 'uploaded').length ?? 0;

  return (
    <Panel
      title="Backup recordings"
      description={summary}
      actions={
        finished.length > 0 && (
          <>
            <button type="button" onClick={() => void downloadAll()} disabled={downloading} className={buttonClass({ style: 'outline', color: 'gray' })}>
              {downloading ? <Spinner /> : <ArrowDownTrayIcon className="size-4" />}
              Download all
            </button>
            <button
              type="button"
              onClick={() => deskBackup()?.uploadAll(finished.map((p) => p.id))}
              title="Sends every finished piece today for a full check; the server only adds captions that are missing."
              className={buttonClass({ style: 'soft' })}
            >
              <ArrowUpTrayIcon className="size-4" />
              Upload all
            </button>
          </>
        )
      }
      footer={
        (older.length > 0 || !backup.durable) && (
          <>
            {!backup.durable ? (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <ExclamationTriangleIcon className="size-4 shrink-0" />
                This browser is not keeping recordings on disk: they last until the page closes.
              </p>
            ) : (
              <span />
            )}
            {older.length > 0 && (
              <p className="flex items-center gap-3 text-xs">
                {older.length} from earlier days · {formatBytes(older.reduce((s, p) => s + p.bytes, 0))}
                <button type="button" onClick={() => setDeleting(older)} className="text-danger hover:underline">
                  Delete them
                </button>
              </p>
            )}
          </>
        )
      }
    >
      {backup.offline.length > 0 && (
        <p role="status" className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          <SignalSlashIcon className="mt-0.5 size-4 shrink-0" />
          Offline{backup.offline.length < backup.rooms.length ? ` in ${backup.offline.join(', ')}` : ''}: the backup keeps recording; missed captions are filled in when the link returns.
        </p>
      )}
      {byRoom.length === 0 ? (
        <p className="px-6 py-5 text-sm text-hint">Nothing recorded today yet. Start a room and its backup begins with it.</p>
      ) : (
        <div className="divide-y divide-border">
          {byRoom.map(([room, pieces]) => (
            <section key={room} aria-label={`${room} backups`} className="px-6 py-3">
              <h3 className="text-sm font-medium text-ink">{room}</h3>
              <ul className="mt-1">
                {pieces.map((p) => {
                  const label = pieceLabel(p);
                  const busy = p.status === 'recording' || p.status === 'uploading';
                  const range = `${hm(p.startedAt)}–${p.status === 'recording' ? 'now' : hm(p.endedAt)}`;
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-28 shrink-0 tabular-nums text-ink-soft">{range}</span>
                      <span className="w-16 shrink-0 text-right tabular-nums text-xs text-hint">{formatBytes(p.bytes)}</span>
                      <span className="min-w-0 flex-1 truncate" title={label.text}>
                        <Tag tone={label.tone} dot={p.status === 'recording' || p.status === 'uploading'} className="max-w-full">
                          <span className="truncate">{label.text}</span>
                        </Tag>
                      </span>
                      <RowActions
                        name={`${room} ${range}`}
                        actions={[
                          { label: 'Upload now', icon: ArrowUpTrayIcon, onSelect: () => deskBackup()?.uploadNow(p.id), disabled: busy || p.status === 'uploaded' },
                          { label: 'Download', icon: ArrowDownTrayIcon, onSelect: () => void download(p), disabled: p.status === 'recording' },
                        ]}
                        onDelete={busy ? undefined : () => setDeleting([p])}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={deleting?.length === 1 ? 'Delete this recording?' : `Delete ${deleting?.length ?? 0} recordings?`}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      >
        {notUploaded > 0
          ? `${deleting?.length === 1 ? 'It has' : notUploaded === 1 ? 'One has' : `${notUploaded} have`} not been uploaded, so this computer holds the only copy. Download first if in doubt.`
          : `${deleting?.length === 1 ? 'It is' : 'They are'} uploaded; this only frees space on this computer.`}
      </ConfirmDialog>
    </Panel>
  );
}
