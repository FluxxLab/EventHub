'use client';

import { CheckIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import { useEffect, useId, useRef, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { scannerLink, type BoothLeadSummary } from '@/lib/leads/leads';
import type { Booth } from '@/lib/passport/passport';

/**
 * A stand's lead-scanner link: made (or replaced) here and shown once, with a QR the stand's staff
 * scan to open it on their phone. Revoking stops it working at once.
 */
export function LeadLinkDialog({
  booth,
  summary,
  pending,
  onIssue,
  onRevoke,
  onClose,
}: {
  booth: Booth | null;
  summary: BoothLeadSummary | undefined;
  pending: boolean;
  onIssue: () => Promise<string>;
  onRevoke: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (booth && !dialog.open) dialog.showModal();
    if (!booth && dialog.open) dialog.close();
  }, [booth]);

  const close = () => {
    setLink(null);
    setQr('');
    setCopied(false);
    setError(null);
    onClose();
  };

  const make = async () => {
    setError(null);
    try {
      const url = scannerLink(window.location.origin, await onIssue());
      setLink(url);
      setQr(await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#002d74' } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The link could not be made.');
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasLink = !!summary?.linkCreatedAt;
  const madeOn = summary?.linkCreatedAt ? new Date(summary.linkCreatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      className={modalClass('md')}
    >
      {booth && (
        <div className="flex flex-col gap-5 p-6">
          <ModalHeader
            icon={DevicePhoneMobileIcon}
            title={`Lead scanner: ${booth.name}`}
            titleId={titleId}
            subtitle="The stand’s staff open this link on their phones to scan visitors’ badges. They see each visitor’s name, job, organisation and email, and can download their leads. No account is needed."
          />

          {link ? (
            <div className="flex flex-col items-center gap-3">
              <div className="size-44 [&_svg]:size-full" aria-hidden dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="text-center text-xs text-[#7c7c7c]">Scan with the phone’s camera to open it, or send the link.</p>
              <div className="flex w-full gap-2">
                <input readOnly value={link} aria-label="Scanner link" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-[#f6f6f6] px-3 font-mono text-xs text-ink" />
                <button type="button" onClick={() => void copy()} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-10' })}>
                  {copied ? <CheckIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-[#8a6d00]">
                This link is shown only now. Send it to the stand’s staff only: anyone with it can see the stand’s leads.
              </p>
            </div>
          ) : hasLink ? (
            <p className="rounded-lg bg-[#f6f6f6] px-3 py-2.5 text-sm text-[#525252]">
              A link was made on {madeOn}, and the stand has {summary?.leads ?? 0} {summary?.leads === 1 ? 'lead' : 'leads'}. For safety it is not shown again. Make a new one to send it again: the old link stops working, the leads stay.
            </p>
          ) : (
            <p className="rounded-lg bg-[#f6f6f6] px-3 py-2.5 text-sm text-[#525252]">This stand has no scanner link yet.</p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <ModalActions>
            {hasLink && !link ? (
              <button type="button" onClick={onRevoke} disabled={pending} className={buttonClass({ style: 'soft', color: 'danger' })}>
                Stop the link working
              </button>
            ) : (
              <button type="button" autoFocus onClick={close} className={cancelClass}>
                {link ? 'Done' : 'Cancel'}
              </button>
            )}
            {!link && (
              <button type="button" onClick={() => void make()} disabled={pending} className={buttonClass()}>
                {pending ? 'Making…' : hasLink ? 'Make a new link' : 'Make the link'}
              </button>
            )}
          </ModalActions>
        </div>
      )}
    </dialog>
  );
}
