'use client';

import { ArrowLeftIcon, CheckIcon, EnvelopeIcon, PaperAirplaneIcon, PlusIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useMemo, useRef, useState } from 'react';

import { DesignPanel } from '@/components/campaigns/design-panel';
import { EventBar } from '@/components/events/event-bar';
import { useSubPage } from '@/components/shell/breadcrumbs';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fieldBox, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toaster';
import {
  AUDIENCE_LABEL,
  DEFAULT_DESIGN,
  draftProblem,
  engagementLine,
  rate,
  EMPTY_DRAFT,
  insertAt,
  MERGE_FIELDS,
  MERGE_LABEL,
  renderCampaign,
  statusLine,
  type AudienceKind,
  type Campaign,
  type CampaignDraft,
  type CampaignImages,
  type MergeField,
} from '@/lib/campaigns/campaigns';
import { useAudienceSize, useCampaignActions, useCampaignDesignDefault, useCampaignLinks, useCampaigns } from '@/lib/campaigns/use-campaigns';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count } from '@/lib/format';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const people = (n: number) => `${count(n)} ${n === 1 ? 'person' : 'people'}`;

/** Email campaigns: write to an event's ticket holders, preview each email, test it, send it. */
export default function CampaignsPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Emails to ticket holders">
      {(editionId) => <CampaignsBoard edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

function CampaignsBoard({ edition }: { edition: Edition }) {
  const list = useCampaigns(edition.id);
  const [open, setOpen] = useState<{ id: string | null; key: string } | null>(null);
  const openCampaign = open?.id ? list.data?.find((c) => c.id === open.id) : null;
  useSubPage(open ? (openCampaign?.subject.trim() || 'New campaign') : null, () => setOpen(null));
  const tiers = useTicketTypes(edition.id);
  const tierNames = useMemo(() => new Map((tiers.data?.tiers ?? []).map((t) => [t.id, t.name])), [tiers.data]);

  if (list.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (list.isError) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">Campaigns could not load.</p>
        <p className="mt-1 text-sm text-muted">{list.error.message}</p>
        <button type="button" onClick={() => void list.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  const all = list.data;
  if (open) {
    const campaign = open.id ? (all.find((c) => c.id === open.id) ?? null) : null;
    return <Composer key={open.key} edition={edition} campaign={campaign} tierNames={tierNames} onSaved={(id) => setOpen({ id, key: open.key })} onClose={() => setOpen(null)} />;
  }

  const audienceText = (c: Campaign) => {
    const tiersText = c.audience.ticketTypeIds.length ? c.audience.ticketTypeIds.map((id) => tierNames.get(id) ?? 'a removed tier').join(', ') : 'all tiers';
    return `${AUDIENCE_LABEL[c.audience.kind]} · ${tiersText}`;
  };

  return (
    <section aria-labelledby="campaigns-title" className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 id="campaigns-title" className="text-base font-medium text-ink">
            Email campaigns
          </h2>
          <p className="text-sm text-[#7c7c7c]">Emails to {edition.shortName}’s ticket holders, in the PIC layout, with each person’s details filled in.</p>
        </div>
        <button type="button" onClick={() => setOpen({ id: null, key: `new-${Date.now()}` })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          New campaign
        </button>
      </header>
      {all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <EnvelopeIcon className="size-6" />
          </span>
          <p className="font-medium text-ink">No campaigns yet</p>
          <p className="max-w-md text-sm text-[#7c7c7c]">Send joining instructions, programme updates or a thank-you after the event. Test it on yourself before it goes out.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {all.map((c) => {
            const done = c.recipients ? (c.sent + c.failed) / c.recipients : 0;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setOpen({ id: c.id, key: c.id })} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-left transition-colors hover:bg-[#f6f6f6]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink">{c.subject}</p>
                    <p className="truncate text-xs text-[#7c7c7c]">{audienceText(c)}</p>
                  </div>
                  <div className="w-56">
                    <p className={cn('text-sm', c.status === 'draft' ? 'text-[#7c7c7c]' : c.status === 'sending' ? 'text-primary' : 'text-ink')}>{statusLine(c, count)}</p>
                    {engagementLine(c) && <p className="text-xs text-[#7c7c7c]">{engagementLine(c)}</p>}
                    {c.status === 'sending' && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(done * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <p className="w-40 text-right text-xs text-[#7c7c7c]">{day(c.finishedAt ?? c.queuedAt ?? c.updatedAt)}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Focus = 'subject' | 'body';

function Composer({
  edition,
  campaign,
  tierNames,
  onSaved,
  onClose,
}: {
  edition: Edition;
  campaign: Campaign | null;
  tierNames: Map<string, string>;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const actions = useCampaignActions(edition.id);
  const initial: CampaignDraft = campaign ? { subject: campaign.subject, body: campaign.body, buttonLabel: campaign.buttonLabel, buttonUrl: campaign.buttonUrl, audience: campaign.audience, design: campaign.design } : EMPTY_DRAFT;
  const [draft, setDraft] = useState<CampaignDraft>(initial);
  // what is on the server, and its id: known the moment a save returns, before the list refreshes
  const [savedDraft, setSavedDraft] = useState<CampaignDraft>(initial);
  const [savedId, setSavedId] = useState<string | null>(campaign?.id ?? null);
  const [showProblem, setShowProblem] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const readOnly = !!campaign && campaign.status !== 'draft';
  // the design's pictures as the preview shows them: signed URLs, or the file just picked
  const [pictures, setPictures] = useState<CampaignImages>({ logo: campaign?.logoUrl ?? null, banner: campaign?.bannerUrl ?? null });
  const eventDesign = useCampaignDesignDefault(edition.id);
  const applyEventDesign = () => {
    if (!eventDesign.data) return;
    const { design, logoUrl, bannerUrl } = eventDesign.data;
    setDraft((d) => ({ ...d, design }));
    setPictures({ logo: logoUrl, banner: bannerUrl });
  };
  // a new campaign starts from the event's branding, once it has loaded
  const [seeded, setSeeded] = useState(!!campaign);
  if (!seeded && eventDesign.data) {
    setSeeded(true);
    applyEventDesign();
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const problem = draftProblem(draft);
  const size = useAudienceSize(edition.id, draft.audience);
  const reach = size.data?.count;

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<Focus>('body');

  const set = (next: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...next }));
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } });

  const addDetail = (field: MergeField) => {
    const target = lastFocus.current === 'subject' ? subjectRef.current : bodyRef.current;
    const key = lastFocus.current;
    const value = draft[key];
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    const { text, cursor } = insertAt(value, start, end, field);
    set({ [key]: text });
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(cursor, cursor);
    });
  };

  /** Saves if needed; answers the campaign's id, or null when the draft cannot be saved. */
  const persist = async (): Promise<string | null> => {
    if (problem) {
      setShowProblem(true);
      return null;
    }
    if (savedId && !dirty) return savedId;
    try {
      const saved = await actions.save.mutateAsync({ id: savedId, draft });
      setSavedId(saved.id);
      setSavedDraft(draft);
      onSaved(saved.id);
      return saved.id;
    } catch (e) {
      fail('Campaign not saved')(e as Error);
      return null;
    }
  };

  const saveDraft = async () => {
    const id = await persist();
    if (id) toast.push({ title: 'Draft saved', leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } });
  };
  const sendTest = async () => {
    const id = await persist();
    if (id) actions.test.mutate(id, { onSuccess: ({ to }) => toast.push({ title: 'Test sent', body: `Check ${to}. It is marked [Test], with sample details filled in.`, leading: { kind: 'icon', icon: EnvelopeIcon, tone: 'success' } }), onError: fail('Test not sent') });
  };
  const askSend = async () => {
    if (await persist()) setConfirming(true);
  };

  const sampleTier = draft.audience.ticketTypeIds.length ? (tierNames.get(draft.audience.ticketTypeIds[0]!) ?? 'VIP') : ([...tierNames.values()][0] ?? 'Standard');
  const sample = { email: 'ngozi.eze@example.com', name: 'Ngozi Eze', code: 'PIC-VIP-3QX7', tier: sampleTier };
  const preview = renderCampaign(draft, sample, edition.name, '#unsubscribe', pictures);
  const busy = actions.save.isPending || actions.send.isPending;

  const toggleTier = (id: string) =>
    set({ audience: { ...draft.audience, ticketTypeIds: draft.audience.ticketTypeIds.includes(id) ? draft.audience.ticketTypeIds.filter((t) => t !== id) : [...draft.audience.ticketTypeIds, id] } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className={buttonClass({ style: 'borderless', color: 'gray' })}>
          <ArrowLeftIcon className="size-4" />
          All campaigns
        </button>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {savedId && (
              <button type="button" onClick={() => setDeleting(true)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
                <TrashIcon className="size-4" />
                Delete draft
              </button>
            )}
            <button type="button" disabled={busy || (!!savedId && !dirty)} onClick={() => void saveDraft()} className={buttonClass({ style: 'soft', color: 'gray' })}>
              {actions.save.isPending ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" disabled={busy || actions.test.isPending} onClick={() => void sendTest()} className={buttonClass({ style: 'outline', color: 'gray' })}>
              <EnvelopeIcon className="size-4" />
              {actions.test.isPending ? 'Sending test…' : 'Send test to me'}
            </button>
            <button type="button" disabled={busy || reach === 0} onClick={() => void askSend()} className={buttonClass()}>
              <PaperAirplaneIcon className="size-4" />
              Send{reach !== undefined ? ` to ${people(reach)}` : ''}
            </button>
          </div>
        )}
      </div>

      {readOnly && campaign && <SentSummary campaign={campaign} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-label="The email" className={cn(cardClass, 'flex flex-col')}>
          <fieldset disabled={readOnly} className="contents">
            <div className="flex flex-col gap-3 border-b border-border px-6 py-5">
              <p className="text-sm font-medium text-ink">Who gets it</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who gets it">
                {(Object.keys(AUDIENCE_LABEL) as AudienceKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.audience.kind === kind}
                    onClick={() => set({ audience: { ...draft.audience, kind } })}
                    className={cn('rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default', draft.audience.kind === kind ? 'border-primary bg-primary-soft/40 text-ink' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
                  >
                    {AUDIENCE_LABEL[kind]}
                  </button>
                ))}
              </div>
              {tierNames.size > 0 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ticket tiers">
                  <span className="text-xs text-[#7c7c7c]">Tiers:</span>
                  <button
                    type="button"
                    aria-pressed={draft.audience.ticketTypeIds.length === 0}
                    onClick={() => set({ audience: { ...draft.audience, ticketTypeIds: [] } })}
                    className={cn('rounded-full border px-3 py-1 text-xs', draft.audience.ticketTypeIds.length === 0 ? 'border-primary bg-primary text-white' : 'border-border text-[#525252]')}
                  >
                    All tiers
                  </button>
                  {[...tierNames].map(([id, name]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={draft.audience.ticketTypeIds.includes(id)}
                      onClick={() => toggleTier(id)}
                      className={cn('rounded-full border px-3 py-1 text-xs', draft.audience.ticketTypeIds.includes(id) ? 'border-primary bg-primary text-white' : 'border-border text-[#525252]')}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {!readOnly && (
                <p className={cn('text-sm', reach === 0 ? 'text-danger' : 'text-[#525252]')} aria-live="polite">
                  {reach === undefined ? 'Counting…' : reach === 0 ? 'Nobody matches this yet.' : `Reaches ${people(reach)} right now.`}
                  {size.data?.unsubscribed ? ` ${people(size.data.unsubscribed)} who unsubscribed ${size.data.unsubscribed === 1 ? 'is' : 'are'} left out.` : ''}
                </p>
              )}
            </div>

            <DesignPanel
              editionId={edition.id}
              design={draft.design ?? DEFAULT_DESIGN}
              pictures={pictures}
              onChange={(design, next) => {
                set({ design });
                if (next) setPictures(next);
              }}
              onReset={eventDesign.data ? applyEventDesign : undefined}
            />

            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex flex-col gap-1">
                <label htmlFor="campaign-subject" className="text-sm text-ink">
                  Subject
                </label>
                <div className={fieldBox()}>
                  <input
                    id="campaign-subject"
                    ref={subjectRef}
                    value={draft.subject}
                    maxLength={200}
                    onFocus={() => (lastFocus.current = 'subject')}
                    onChange={(e) => set({ subject: e.target.value })}
                    placeholder="Your badge and the programme for {{event}}"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-placeholder"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="campaign-body" className="text-sm text-ink">
                    Message
                  </label>
                  {!readOnly && (
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Add a detail">
                      <span className="text-xs text-[#7c7c7c]">Add:</span>
                      {MERGE_FIELDS.map((f) => (
                        <button key={f} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addDetail(f)} className="rounded-md bg-[#f1f1f1] px-2 py-0.5 text-xs text-[#525252] hover:bg-primary-soft hover:text-primary">
                          {MERGE_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  id="campaign-body"
                  ref={bodyRef}
                  value={draft.body}
                  onFocus={() => (lastFocus.current = 'body')}
                  onChange={(e) => set({ body: e.target.value })}
                  rows={12}
                  placeholder={'Dear {{first_name}},\n\nLeave a blank line between paragraphs. Web addresses become links.'}
                  className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-placeholder focus:border-primary disabled:bg-[#f6f6f6]"
                />
                <p className="text-xs text-[#7c7c7c]">Details like {'{{first_name}}'} are filled in for each person.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="flex flex-col gap-1">
                  <label htmlFor="campaign-button" className="text-sm text-ink">
                    Button <span className="text-[#7c7c7c]">(optional)</span>
                  </label>
                  <TextInput id="campaign-button" value={draft.buttonLabel ?? ''} maxLength={60} onChange={(e) => set({ buttonLabel: e.target.value })} placeholder="See the programme" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="campaign-link" className="text-sm text-ink">
                    Opens
                  </label>
                  <TextInput id="campaign-link" type="url" value={draft.buttonUrl ?? ''} onChange={(e) => set({ buttonUrl: e.target.value })} placeholder="https://" />
                </div>
              </div>

              {showProblem && problem && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {problem}
                </p>
              )}
            </div>
          </fieldset>
        </section>

        <section aria-label="Preview" className={cn(cardClass, 'flex flex-col lg:sticky lg:top-4')}>
          <div className="border-b border-border px-5 py-3 text-sm">
            <p className="text-[#7c7c7c]">
              To: <span className="text-ink">{sample.name}</span> · sample details
            </p>
            <p className="mt-0.5 truncate font-medium text-ink">{preview.subject || <span className="font-normal text-placeholder">No subject yet</span>}</p>
          </div>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[36rem] w-full border-0 bg-[#f4f5f7]" />
        </section>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Send to ${reach !== undefined ? people(reach) : 'everyone chosen'}?`}
        confirmLabel="Send now"
        pendingLabel="Starting…"
        pending={actions.send.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          savedId &&
          actions.send.mutate(savedId, {
            onSuccess: () => {
              setConfirming(false);
              toast.push({ title: 'Sending', body: 'Emails go out in the background; progress shows on the campaign.', leading: { kind: 'icon', icon: PaperAirplaneIcon, tone: 'success' } });
            },
            onError: (e) => {
              setConfirming(false);
              fail('Not sent')(e);
            },
          })
        }
      >
        “{draft.subject}” goes to {AUDIENCE_LABEL[draft.audience.kind].toLowerCase()}
        {draft.audience.ticketTypeIds.length ? ` with ${draft.audience.ticketTypeIds.map((id) => tierNames.get(id)).join(' or ')} tickets` : ''} at {edition.shortName}. Once sent, emails cannot be recalled.
      </ConfirmDialog>
      <ConfirmDialog
        open={deleting}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        pending={actions.remove.isPending}
        tone="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => savedId && actions.remove.mutate(savedId, { onSuccess: onClose, onError: fail('Draft not deleted') })}
      >
        “{savedDraft.subject}” is deleted. Nobody has been sent it.
      </ConfirmDialog>
    </div>
  );
}

function SentSummary({ campaign }: { campaign: Campaign }) {
  const done = campaign.recipients ? (campaign.sent + campaign.failed) / campaign.recipients : 0;
  const links = useCampaignLinks(campaign);
  return (
    <section aria-label="Sending" className={cn(cardClass, 'flex flex-col gap-3 px-6 py-5')} aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#7c7c7c]">{campaign.status === 'sending' ? 'Sending now' : `Sent ${campaign.finishedAt ? day(campaign.finishedAt) : ''}`}</p>
          <p className="text-2xl font-medium tabular-nums text-ink">{statusLine(campaign, count)}</p>
        </div>
        <dl className="flex gap-6 text-sm">
          {[
            ['Recipients', campaign.recipients],
            ['Delivered to the mail service', campaign.sent],
            ['Failed', campaign.failed],
          ].map(([label, n]) => (
            <div key={label as string}>
              <dt className="text-xs text-[#7c7c7c]">{label}</dt>
              <dd className={cn('tabular-nums', label === 'Failed' && (n as number) > 0 ? 'text-danger' : 'text-ink')}>{count(n as number)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {campaign.status === 'sending' && (
        <div className="h-2 overflow-hidden rounded-full bg-[#f1f1f1]">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(done * 100)}%` }} />
        </div>
      )}
      {campaign.tracked ? (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Opened', campaign.opened],
              ['Clicked a link', campaign.clicked],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg bg-[#f6f6f6] px-3 py-2.5">
                <dt className="text-xs text-[#7c7c7c]">{label}</dt>
                <dd className="text-xl font-medium tabular-nums text-ink">{rate(n as number, campaign.sent) ?? 0}%</dd>
                <dd className="text-xs tabular-nums text-[#7c7c7c]">{people(n as number)}</dd>
              </div>
            ))}
          </dl>
          <div className="min-w-0">
            <p className="text-xs text-[#7c7c7c]">Links clicked</p>
            {links.data && links.data.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1.5">
                {links.data.map((l) => (
                  <li key={l.url} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[#525252]" title={l.url}>
                      {l.url.replace(/^https?:\/\//, '')}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink">{count(l.clicks)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-[#7c7c7c]">No clicks yet.</p>
            )}
          </div>
          <p className="text-xs text-[#7c7c7c] sm:col-span-2">
            Opens are an estimate: some mail apps (Apple Mail among them) load every image for privacy, which counts as an open; others block images, and a click then counts instead.
          </p>
        </div>
      ) : (
        campaign.status !== 'sending' && <p className="text-xs text-[#7c7c7c]">This campaign went out without open and click tracking.</p>
      )}
      <p className="text-xs text-[#7c7c7c]">A sent campaign cannot be changed. To follow up, start a new one.</p>
    </section>
  );
}
