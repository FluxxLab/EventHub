/**
 * Email campaigns to an event's ticket holders (`/editions/:id/campaigns`). The API sends them in
 * the background from a queue; the console writes them and previews each email exactly as it goes
 * out. `renderCampaign` mirrors the API's `src/campaigns/campaign-email.ts`, so what is previewed
 * is what arrives: change both together.
 */

export type AudienceKind = 'all' | 'checked_in' | 'not_checked_in';
export type Audience = { kind: AudienceKind; ticketTypeIds: string[] };
export type CampaignStatus = 'draft' | 'sending' | 'sent';

export type Campaign = {
  id: string;
  editionId: string;
  subject: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  audience: Audience;
  status: CampaignStatus;
  recipients: number;
  sent: number;
  failed: number;
  /** People who opened it, once each (an estimate: some mail apps load images for everyone). */
  opened: number;
  /** People who clicked a link, once each. */
  clicked: number;
  /** Whether it went out with open and click tracking. */
  tracked: boolean;
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
  finishedAt: string | null;
};

export type CampaignDraft = Pick<Campaign, 'subject' | 'body' | 'buttonLabel' | 'buttonUrl' | 'audience'>;

export const EMPTY_DRAFT: CampaignDraft = { subject: '', body: '', buttonLabel: null, buttonUrl: null, audience: { kind: 'all', ticketTypeIds: [] } };

export const AUDIENCE_LABEL: Record<AudienceKind, string> = {
  all: 'Everyone with a ticket',
  checked_in: 'People who have checked in',
  not_checked_in: 'People not checked in yet',
};

export const MERGE_FIELDS = ['first_name', 'name', 'ticket_code', 'tier', 'event'] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export const MERGE_LABEL: Record<MergeField, string> = { first_name: 'First name', name: 'Full name', ticket_code: 'Ticket code', tier: 'Ticket tier', event: 'Event name' };

export type Recipient = { email: string; name: string; code: string; tier: string };

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function unknownFields(...texts: (string | null)[]): string[] {
  const unknown = new Set<string>();
  for (const text of texts) for (const [, f] of (text ?? '').matchAll(FIELD)) if (!(MERGE_FIELDS as readonly string[]).includes(f!.toLowerCase())) unknown.add(f!);
  return [...unknown];
}

export function merge(text: string, r: Recipient, event: string): string {
  const v: Record<MergeField, string> = { first_name: r.name.trim().split(/\s+/)[0] ?? '', name: r.name.trim(), ticket_code: r.code, tier: r.tier, event };
  return text.replace(FIELD, (whole, f: string) => {
    const key = f.toLowerCase() as MergeField;
    return key in v ? v[key] : whole;
  });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function bodyHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((para) => {
      const inner = escapeHtml(para)
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:#002d74;text-decoration:underline">${url}</a>`)
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#292929">${inner}</p>`;
    })
    .join('');
}

/** One person's email: the subject, and the HTML shown in the preview (with the unsubscribe link every real one carries). */
export function renderCampaign(c: CampaignDraft, r: Recipient, event: string, unsubscribeUrl: string | null = '#unsubscribe'): { subject: string; html: string } {
  const subject = merge(c.subject, r, event).replace(/\s+/g, ' ').trim();
  const body = merge(c.body, r, event);
  const label = c.buttonLabel ? merge(c.buttonLabel, r, event) : null;
  const url = c.buttonUrl;
  const why = `You are receiving this because you have a ticket to ${event}.`;
  const button =
    label && url
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="background:#002d74;border-radius:8px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`
      : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#002d74;padding:20px 28px"><p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#f2b705">Policy Innovation Centre</p><p style="margin:4px 0 0;font-size:20px;font-weight:600;color:#ffffff">${escapeHtml(event)}</p></td></tr>
<tr><td style="padding:28px 28px 12px">${bodyHtml(body)}${button}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #ececec"><p style="margin:0;font-size:12px;line-height:18px;color:#7c7c7c">${escapeHtml(why)}<br>Policy Innovation Centre${unsubscribeUrl ? ` · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7c7c7c;text-decoration:underline">Unsubscribe from event emails</a>` : ''}</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

/** The first thing stopping a draft from being saved, or null. */
export function draftProblem(d: CampaignDraft): string | null {
  if (!d.subject.trim()) return 'Write a subject.';
  if (d.subject.length > 200) return 'Keep the subject under 200 characters.';
  if (!d.body.trim()) return 'Write the message.';
  const unknown = unknownFields(d.subject, d.body, d.buttonLabel);
  if (unknown.length) return `There is no ${unknown.map((f) => `{{${f}}}`).join(', ')} to fill in. Use the buttons above the message to add details.`;
  const label = d.buttonLabel?.trim();
  const url = d.buttonUrl?.trim();
  if (!!label !== !!url) return 'A button needs both its words and the address it opens, or neither.';
  if (url && !URL_RE.test(url)) return 'The button address should start with https://';
  if (label && label.length > 60) return 'Keep the button under 60 characters.';
  return null;
}

/** "Sending: 340 of 1,200", "Sent to 1,198 · 2 failed", "Draft". */
export function statusLine(c: Pick<Campaign, 'status' | 'recipients' | 'sent' | 'failed'>, count: (n: number) => string): string {
  if (c.status === 'draft') return 'Draft';
  const failed = c.failed ? ` · ${count(c.failed)} failed` : '';
  if (c.status === 'sending') return `Sending: ${count(c.sent + c.failed)} of ${count(c.recipients)}${failed}`;
  return `Sent to ${count(c.sent)}${failed}`;
}

/** Share of those it reached, as a whole percentage; null before anyone was reached. */
export const rate = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);

/** "43% opened · 12% clicked" for a tracked campaign that has gone out; null otherwise. */
export function engagementLine(c: Pick<Campaign, 'status' | 'sent' | 'opened' | 'clicked' | 'tracked'>): string | null {
  if (!c.tracked || c.status === 'draft' || !c.sent) return null;
  return `${rate(c.opened, c.sent)}% opened · ${rate(c.clicked, c.sent)}% clicked`;
}

/** Inserts a merge field where the cursor is, with a space either side if it would touch a word. */
export function insertAt(text: string, start: number, end: number, field: MergeField): { text: string; cursor: number } {
  const token = `{{${field}}}`;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const pre = before && !/\s$/.test(before) ? ' ' : '';
  const post = after && !/^[\s.,!?;:]/.test(after) ? ' ' : '';
  const next = `${before}${pre}${token}${post}${after}`;
  return { text: next, cursor: before.length + pre.length + token.length };
}
