'use client';

import { CheckIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, SignalIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { encoderFields, INPUT_LABEL, testCommand, type StreamCredentials, type StreamInput } from '@/lib/ingest/ingest';
import { useIngestActions } from '@/lib/ingest/use-ingest';
import { cn } from '@/lib/utils';

const INPUTS: { value: StreamInput; title: string; body: string }[] = [
  { value: 'rtmp', title: 'RTMPS', body: 'Hardware encoders, vMix, Wirecast, OBS. The one every encoder has.' },
  { value: 'whip', title: 'WHIP', body: 'OBS 30 or later. Lower delay, and no transcoding charge.' },
];

/** A value with a copy button; a secret one is hidden until revealed. */
function CopyField({ label, value, secret }: { label: string; value: string; secret: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div>
      <p className="mb-1 text-sm text-ink">{label}</p>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-[#f6f6f6] py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={shown ? value : undefined}>
          {shown ? value : '•'.repeat(24)}
        </code>
        {secret && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true })}
          >
            {shown ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        )}
        <button type="button" onClick={copy} aria-label={`Copy ${label}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true })}>
          {copied ? <CheckIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Sets up a room's venue stream, then shows the encoder settings. The key is shown here once
 * (the API never returns it again), so the dialog says so and makes copying easy. Opened with
 * `credentials` already set after a key rotation, it skips straight to the settings.
 */
export function StreamDialog({
  room,
  credentials: given,
  onClose,
}: {
  room: string | null;
  credentials?: StreamCredentials | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const { create } = useIngestActions();
  const [input, setInput] = useState<StreamInput>('rtmp');
  const [diarise, setDiarise] = useState(false);
  const [created, setCreated] = useState<StreamCredentials | null>(null);
  const credentials = given ?? created;
  const open = !!room;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (create.isPending) return;
    create.reset();
    setCreated(null);
    setInput('rtmp');
    setDiarise(false);
    onClose();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!room || credentials) return close();
    create.mutate({ room, input, diarise }, { onSuccess: setCreated });
  };

  const command = credentials && testCommand(credentials);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${baseId}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('md')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={SignalIcon}
            title={credentials ? `Encoder settings for ${room}` : `Audio stream for ${room}`}
            titleId={`${baseId}-title`}
            subtitle={credentials ? 'Give these to the AV team for the encoder that carries this room.' : "The venue's mixer sends this room's speech straight to captions."}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          {credentials ? (
            <>
              <p role="note" className="flex items-start gap-2 rounded-lg bg-[#fdf6e0] px-3 py-2.5 text-sm text-[#7a5d00]">
                <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
                Copy the key now: it is not shown again. If it is lost, rotate it for a new one.
              </p>
              {encoderFields(credentials).map((f) => (
                <CopyField key={f.label} {...f} />
              ))}
              <div className="rounded-lg border border-border p-4 text-sm text-[#525252]">
                <p className="font-medium text-ink">On the encoder</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>Send the room&apos;s speech mix: microphones only, no music or playback.</li>
                  <li>Audio {credentials.input === 'whip' ? 'Opus' : 'AAC'}, 48 kHz, 128 kbps. Video is optional and ignored by captions.</li>
                  <li>Leave it streaming all day. Captions reach a session only while it is live in the room.</li>
                </ul>
              </div>
              {command && (
                <CopyField label="Test from any laptop with ffmpeg" value={command} secret={false} />
              )}
            </>
          ) : (
            <>
              <fieldset>
                <legend className="mb-2 text-sm text-ink">How the encoder connects</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INPUTS.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        'cursor-pointer rounded-lg border p-4 transition-colors',
                        input === option.value ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-[#bdbdbd]',
                      )}
                    >
                      <input type="radio" name={`${baseId}-input`} value={option.value} checked={input === option.value} onChange={() => setInput(option.value)} className="sr-only" />
                      <span className="flex items-center justify-between text-sm font-medium text-ink">
                        {option.title}
                        <span className={cn('size-4 rounded-full border', input === option.value ? 'border-4 border-primary' : 'border-[#bdbdbd]')} aria-hidden />
                      </span>
                      <span className="mt-1 block text-xs text-[#7c7c7c]">{option.body}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                <div id={`${baseId}-diarise`}>
                  <p className="text-sm text-ink">Label speakers</p>
                  <p className="text-xs text-[#7c7c7c]">For panels. Adds a little delay and can split one voice in two.</p>
                </div>
                <Switch checked={diarise} onChange={setDiarise} labelledBy={`${baseId}-diarise`} />
              </div>
              {create.error && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {create.error.message}
                </p>
              )}
            </>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          {credentials ? (
            <button type="submit" className={buttonClass()}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={close} disabled={create.isPending} className={cancelClass}>
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className={buttonClass()}>
                {create.isPending ? 'Creating…' : `Create ${INPUT_LABEL[input]} stream`}
              </button>
            </>
          )}
        </ModalActions>
      </form>
    </dialog>
  );
}
