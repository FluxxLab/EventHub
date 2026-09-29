'use client';

import { ArrowTopRightOnSquareIcon, BookOpenIcon, CheckBadgeIcon, DocumentArrowUpIcon, DocumentTextIcon, ShieldCheckIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { CertificateDesigner } from '@/components/certificates/certificate-designer';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import { looksLikeCode, normaliseCode, type PurpleBook } from '@/lib/certificates/certificates';
import { usePublishPurpleBook, usePurpleBook, useVerifyCertificate } from '@/lib/certificates/use-certificates';
import { useEditions } from '@/lib/events/use-editions';
import { ago } from '@/lib/format';
import { fileProblem, formatBytes } from '@/lib/materials/materials';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Publish or replace the Purple Book: a PDF (uploaded here) or a link to where it lives. */
function PublishDialog({ open, current, onClose }: { open: boolean; current: PurpleBook | null; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const publish = usePublishPurpleBook(setProgress);
  const [source, setSource] = useState<'upload' | 'link'>('upload');
  const [title, setTitle] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<boolean>(false);
  if (open && !openedFor) {
    setOpenedFor(true);
    setTitle(current?.title ?? '');
    setSizeLabel('');
    setLink('');
    setFile(null);
    setProblem(null);
    setSource('upload');
  }

  const pick = (f: File | undefined) => {
    if (!f) return;
    const p = fileProblem(f);
    setProblem(p);
    if (!p) {
      setFile(f);
      setSizeLabel(formatBytes(f.size));
    }
  };
  const close = () => {
    setOpenedFor(false);
    publish.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setProblem('Give it a title.');
    if (source === 'upload' && !file) return setProblem('Choose the PDF.');
    if (source === 'link' && !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(link.trim())) return setProblem('Enter a full https:// address.');
    publish.mutate(
      { title: title.trim(), sizeLabel: sizeLabel.trim(), ...(source === 'upload' ? { file: file! } : { link: link.trim() }) },
      {
        onSuccess: () => {
          toast.push({ title: current ? 'Purple Book replaced' : 'Purple Book published', body: 'Delegates get the new copy from the app straight away.', leading: { kind: 'icon', icon: BookOpenIcon, tone: 'success' } });
          close();
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      icon={BookOpenIcon}
      title={current ? 'Replace the Purple Book' : 'Publish the Purple Book'}
      subtitle="The app’s download link points at this copy."
      pending={publish.isPending}
      submitLabel={progress !== null ? `Uploading ${Math.round(progress * 100)}%` : current ? 'Replace' : 'Publish'}
      error={publish.error?.message ?? null}
      onClose={close}
      onSubmit={submit}
    >
      <div role="radiogroup" aria-label="Source" className="flex gap-2">
        {(['upload', 'link'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            onClick={() => {
              setSource(s);
              setProblem(null);
            }}
            className={cn('h-9 rounded-lg border px-3 text-sm', source === s ? 'border-primary bg-primary-soft/50 font-medium text-primary' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
          >
            {s === 'upload' ? 'Upload a PDF' : 'Link to it'}
          </button>
        ))}
      </div>
      {source === 'upload' ? (
        <div>
          <label htmlFor={`${id}-file`} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-[#bdbdbd] px-4 py-6 text-center hover:border-primary">
            {file ? <DocumentTextIcon className="size-6 text-primary" /> : <DocumentArrowUpIcon className="size-6 text-[#7c7c7c]" />}
            <span className="text-sm text-ink">{file ? file.name : 'Choose the PDF'}</span>
            <span className="text-xs text-[#7c7c7c]">{file ? `${formatBytes(file.size)} · click to choose another` : 'Up to 50 MB'}</span>
            <input id={`${id}-file`} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {progress !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      ) : (
        <Field id={`${id}-link`} label="Link">
          <TextInput id={`${id}-link`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://policycentre.org/purple-book-2027.pdf" maxLength={512} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field id={`${id}-title`} label="Title">
          <TextInput id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Purple Book 2027" maxLength={255} />
        </Field>
        <Field id={`${id}-size`} label="Size" optional>
          <TextInput id={`${id}-size`} value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} placeholder="6.8 MB" maxLength={32} />
        </Field>
      </div>
      {problem && <p className="text-sm text-danger">{problem}</p>}
    </FormDialog>
  );
}

function VerifyCard() {
  const id = useId();
  const verify = useVerifyCertificate();
  const [input, setInput] = useState('');
  const code = normaliseCode(input);
  const result = verify.data;

  return (
    <section aria-labelledby={`${id}-t`} className={cardClass}>
      <header className="border-b border-border px-6 py-4">
        <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-medium text-ink">
          <ShieldCheckIcon className="size-5 text-primary" /> Check a certificate
        </h2>
        <p className="text-sm text-[#7c7c7c]">Every certificate carries a code. Enter one to confirm who it was issued to.</p>
      </header>
      <form
        className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (looksLikeCode(code)) verify.mutate(code);
        }}
      >
        <Field id={`${id}-code`} label="Code" className="flex-1">
          <TextInput
            id={`${id}-code`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              verify.reset();
            }}
            placeholder="GS27-K7M2P-X4QRT"
            className="font-mono uppercase tracking-wider"
            autoComplete="off"
          />
        </Field>
        <button type="submit" disabled={!looksLikeCode(code) || verify.isPending} className={buttonClass({ className: 'sm:mb-0' })}>
          {verify.isPending ? 'Checking…' : 'Check'}
        </button>
      </form>
      {verify.error && <p className="px-6 pb-5 text-sm text-danger">{verify.error.message}</p>}
      {result && (
        <div aria-live="polite" className={cn('mx-6 mb-5 flex items-start gap-3 rounded-lg px-4 py-3', result.valid ? 'bg-success-soft' : 'bg-danger-soft')}>
          {result.valid ? <CheckBadgeIcon className="size-6 shrink-0 text-success" /> : <XCircleIcon className="size-6 shrink-0 text-danger" />}
          <div>
            <p className={cn('text-sm font-medium', result.valid ? 'text-success' : 'text-danger')}>{result.valid ? 'Genuine certificate' : 'No certificate has this code'}</p>
            {result.valid ? (
              <p className="text-sm text-ink">
                Issued to <span className="font-medium">{result.delegateName}</span>
                {result.event && <> for {result.event}</>}
                {result.issuedAt && <> on {day(result.issuedAt)}</>}.
              </p>
            ) : (
              <p className="text-sm text-[#525252]">Check it was typed exactly as printed. Codes are not case-sensitive.</p>
            )}
          </div>
        </div>
      )}
      <p className="border-t border-border bg-[#f6f6f6] px-6 py-3 text-xs text-[#7c7c7c]">
        Delegates download their certificate from the app as a PDF with their name printed on it. Verifiers can check codes without an account.
      </p>
    </section>
  );
}

export default function CertificatesPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const book = usePurpleBook();
  const editions = useEditions();
  const [publishing, setPublishing] = useState(false);
  const now = useNow(60_000).getTime();

  if (!isAdmin) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <BookOpenIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">Certificates and the Purple Book are managed by organisers</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl items-start gap-5 lg:grid-cols-2">
      {editions.isPending ? (
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
      ) : editions.isError ? (
        <p role="alert" className={cn(cardClass, 'p-6 text-sm text-danger lg:col-span-2')}>
          {editions.error.message}
        </p>
      ) : editions.data.length ? (
        <CertificateDesigner editions={editions.data} />
      ) : (
        <p className={cn(cardClass, 'p-6 text-sm text-[#7c7c7c] lg:col-span-2')}>Create an event first: each event has its own certificate.</p>
      )}

      {auth.user.tier === 'admin' && (
        <section aria-labelledby="pb-title" className={cardClass}>
          <header className="border-b border-border px-6 py-4">
            <h2 id="pb-title" className="flex items-center gap-2 text-base font-medium text-ink">
              <BookOpenIcon className="size-5 text-primary" /> The Purple Book
            </h2>
            <p className="text-sm text-[#7c7c7c]">The summit’s published report, downloadable from the app.</p>
          </header>
          {book.isPending ? (
            <div className="p-6">
              <Skeleton className="h-20" />
            </div>
          ) : book.isError ? (
            <p role="alert" className="p-6 text-sm text-danger">
              {book.error.message}
            </p>
          ) : book.data ? (
            <div className="flex items-center gap-4 px-6 py-5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[#5b2a86]/10 text-[#5b2a86]">
                <DocumentTextIcon className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <a href={book.data.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[15px] text-ink hover:text-primary hover:underline">
                  <span className="truncate">{book.data.title}</span>
                  <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 text-[#7c7c7c]" />
                </a>
                <p className="text-xs text-[#7c7c7c]">
                  {book.data.sizeLabel && `${book.data.sizeLabel} · `}Updated {ago(book.data.updatedAt, now).toLowerCase()}
                </p>
              </div>
            </div>
          ) : (
            <p className="px-6 py-8 text-sm text-[#7c7c7c]">Not published yet. The app hides its download until there is a copy.</p>
          )}
          <footer className="flex justify-end border-t border-border bg-[#f6f6f6] px-6 py-3">
            <button type="button" onClick={() => setPublishing(true)} className={buttonClass()}>
              {book.data ? 'Replace' : 'Publish'}
            </button>
          </footer>
        </section>
      )}

      <VerifyCard />

      {auth.status === 'signed-in' && auth.user.tier === 'admin' && <PublishDialog open={publishing} current={book.data ?? null} onClose={() => setPublishing(false)} />}
    </div>
  );
}
