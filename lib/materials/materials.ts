import { z } from 'zod';

export const KINDS = ['slides', 'paper', 'communique', 'recording', 'link', 'other'] as const;
export type MaterialKind = (typeof KINDS)[number];

export const KIND_LABEL: Record<MaterialKind, string> = {
  slides: 'Slides',
  paper: 'Paper',
  communique: 'Communiqué',
  recording: 'Recording',
  link: 'Link',
  other: 'Other',
};

/** `GET /sessions/:id/materials`: `url` is ready to open (uploads come back signed). */
export type Material = { id: string; sessionId: string; title: string; url: string; kind: MaterialKind; sizeLabel: string | null; sortOrder: number };

/** Uploads are PDFs only (see lib/uploads). */
export const UPLOAD_TYPE = 'application/pdf';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type Source = 'upload' | 'link';

export const materialSchema = z
  .object({
    title: z.string().trim().min(1, 'Give it a title.').max(200, 'Keep the title under 200 characters.'),
    kind: z.enum(KINDS),
    source: z.enum(['upload', 'link']),
    url: z.string().trim(),
    hasFile: z.boolean(),
    sizeLabel: z.string().trim().max(20, 'Keep it under 20 characters, like “2.4 MB”.'),
  })
  .superRefine((form, ctx) => {
    if (form.source === 'link' && !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(form.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Enter a full https:// address.' });
    }
    if (form.source === 'upload' && !form.hasFile) ctx.addIssue({ code: 'custom', path: ['hasFile'], message: 'Choose a PDF to upload.' });
  });
export type MaterialForm = z.input<typeof materialSchema>;

export const emptyMaterial = (canUpload: boolean): MaterialForm => ({ title: '', kind: 'slides', source: canUpload ? 'upload' : 'link', url: '', hasFile: false, sizeLabel: '' });
export const materialFormOf = (m: Material): MaterialForm => ({ title: m.title, kind: m.kind, source: 'link', url: m.url, hasFile: false, sizeLabel: m.sizeLabel ?? '' });

/** "2.4 MB" for the size shown beside a download. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Why a picked file cannot be uploaded, or null. */
export function fileProblem(file: { type: string; size: number; name: string }): string | null {
  const pdf = file.type === UPLOAD_TYPE || file.name.toLowerCase().endsWith('.pdf');
  if (!pdf) return 'Only PDFs can be uploaded. Export slides to PDF, or add a link instead.';
  if (file.size > MAX_UPLOAD_BYTES) return `That file is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  return null;
}

/** Where a material lives, for the list: an uploaded file or the site it links to. */
export function sourceLabel(url: string): string {
  try {
    const u = new URL(url);
    // Uploads come back as signed storage URLs.
    if (u.searchParams.has('X-Amz-Signature')) return 'Uploaded PDF';
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Uploaded file';
  }
}

/** New sort orders after moving one material up or down: a clean 0..n-1 run, only changes returned. */
export function moveMaterial(materials: Material[], id: string, direction: -1 | 1): { id: string; sortOrder: number }[] {
  const order = [...materials].sort((a, b) => a.sortOrder - b.sortOrder);
  const i = order.findIndex((m) => m.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return [];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return order.flatMap((m, sortOrder) => (m.sortOrder === sortOrder ? [] : [{ id: m.id, sortOrder }]));
}
