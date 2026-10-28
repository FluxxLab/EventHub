'use client';

import { TrophyIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import type { TopBrief } from '@/lib/calls-to-action/top-brief-docx';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';

const textarea = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm leading-6 text-ink shadow-xs outline-none placeholder:text-placeholder focus:border-primary';

/** The theme last used for this event, kept in the browser so it need not be typed again. */
const themeKey = (editionId: string) => `top-brief-theme:${editionId}`;
const readTheme = (editionId: string) => {
  try {
    return localStorage.getItem(themeKey(editionId)) ?? '';
  } catch {
    return '';
  }
};

const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A sample answer for demo mode, which has no server to write one. */
const demoBrief = (event: string, theme: string): TopBrief => ({
  event,
  theme: theme || 'Shared compute and AI infrastructure',
  read: { approved: 12, pending: 3 },
  summary: 'Shared compute only pays off with reliable power and the skills to use it.',
  recommendations: [
    {
      rank: 1,
      title: 'Map national compute capacity and open a transparent access scheme.',
      detail: 'Inventory public and private compute, then run access through an open portal.',
      whyItRanks: 'Raised in three sessions, and names the steps.',
      directedAt: 'Federal Government',
      raisedBy: ['A speaker (An organisation)'],
      quote: 'Access must be transparent, affordable, and accountable.',
      deadline: null,
      amount: null,
      session: 'A research session',
      pending: false,
    },
  ],
  commitments: [],
  honourableMentions: [],
});

/**
 * The event's abridged brief as a Word file: the AI ranks every call to action against the
 * event's theme and keeps the top recommendations and commitments, each with who it is for,
 * who raised it, their words and why it ranks.
 */
export function TopBriefDialog({ open, edition, approved, pending: pendingCount, onClose }: { open: boolean; edition: Edition; approved: number; pending: number; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const [theme, setTheme] = useState(() => readTheme(edition.id));
  const [count, setCount] = useState('5');
  const [includePending, setIncludePending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const considered = approved + (includePending ? pendingCount : 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (considered === 0) return setError(includePending ? 'There are no calls to action yet. Analyse the sessions first.' : 'None are approved yet. Approve some, or include those pending review.');
    setError(null);
    setBusy(true);
    try {
      localStorage.setItem(themeKey(edition.id), theme.trim());
    } catch {
      // private browsing: the theme is just not remembered
    }
    void (async () => {
      try {
        const brief: TopBrief = DEMO_MODE
          ? demoBrief(edition.name, theme.trim())
          : await api.postSlow<TopBrief>(`/editions/${edition.id}/calls-to-action/top-brief`, { theme: theme.trim() || undefined, includePending, count: Number(count) });
        const [{ topBriefDocx }, { saveFile }] = await Promise.all([import('@/lib/calls-to-action/top-brief-docx'), import('@/lib/calls-to-action/report-docx')]);
        saveFile(await topBriefDocx(brief, longDate(new Date())), `${edition.shortName}-top-${count}-recommendations-and-commitments.docx`);
        toast.push({
          title: 'Brief downloaded',
          body: `${brief.recommendations.length} recommendations and ${brief.commitments.length} commitments, ranked from ${considered} calls to action. Check it before sharing.`,
          leading: { kind: 'icon', icon: TrophyIcon, tone: 'success' },
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The brief could not be written. Try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <FormDialog
      open={open}
      icon={TrophyIcon}
      title="Top recommendations brief"
      subtitle="The AI ranks every call to action against the theme and writes the top picks into a short Word document."
      pending={busy}
      pendingLabel="Ranking… about a minute"
      submitLabel="Download Word brief"
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {busy ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner className="size-6" />
          <p className="text-sm text-ink-soft">
            Reading {considered} calls to action and picking the top {count} of each kind for the theme. Keep this open.
          </p>
        </div>
      ) : (
        <>
          <Field id={`${id}-theme`} label="Conference theme" hint="What the picks are ranked against. Leave blank to use the event’s description.">
            <textarea id={`${id}-theme`} rows={2} maxLength={500} value={theme} placeholder="Africa’s Shared Compute and AI Infrastructure" onChange={(e) => setTheme(e.target.value)} className={textarea} />
          </Field>
          <Field id={`${id}-count`} label="How many of each">
            <Select id={`${id}-count`} value={count} options={['3', '5', '7', '10'].map((n) => ({ value: n, label: `Top ${n} recommendations and top ${n} commitments` }))} onChange={setCount} />
          </Field>
          <div className="flex items-center gap-3">
            <Switch checked={includePending} onChange={setIncludePending} labelledBy={`${id}-pending`} />
            <span id={`${id}-pending`} className="text-sm text-ink">
              Include the {pendingCount} still pending review (marked as such in the brief)
            </span>
          </div>
          <p className="text-sm text-ink-soft">
            Ranks {considered} calls to action: {approved} approved{includePending ? ` and ${pendingCount} pending` : ''}. Rejected and merged ones are left out.
          </p>
        </>
      )}
    </FormDialog>
  );
}
