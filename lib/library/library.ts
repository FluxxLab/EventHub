/**
 * The learning library: an event's resources (reports, toolkits, recordings, courses elsewhere),
 * shown in the app with the session materials and the Purple Book. Files are uploaded here;
 * videos and web pages are links.
 */

export const LIBRARY_KINDS = ['document', 'video', 'audio', 'link'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const KIND_LABEL: Record<LibraryKind, string> = { document: 'Document', video: 'Video', audio: 'Audio', link: 'Web page' };
export const KIND_HINT: Record<LibraryKind, string> = {
  document: 'Upload a PDF, Word, PowerPoint or Excel file',
  video: 'Link to YouTube, Vimeo or wherever it is hosted',
  audio: 'Upload an MP3 or M4A file',
  link: 'Link to a course, report or page elsewhere',
};

/** Kinds that are uploaded files; the others are links. */
export const isUpload = (kind: LibraryKind) => kind === 'document' || kind === 'audio';

export type LibraryItem = {
  id: string;
  title: string;
  description: string | null;
  kind: LibraryKind;
  url: string | null;
  isFile: boolean;
  topic: string | null;
  sizeLabel: string | null;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: string;
};

export const FILE_TYPES: Record<LibraryKind, string[]> = {
  document: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a'],
  video: [],
  link: [],
};
export const LIBRARY_MAX_BYTES = 100 * 1024 * 1024;

/** The type the API is told for a file: some browsers call an M4A "audio/x-m4a". */
export const uploadType = (file: { type: string }) => (file.type === 'audio/x-m4a' ? 'audio/mp4' : file.type);

/** "2.4 MB", "640 KB". */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Why a file cannot be a resource of this kind, or null. */
export function fileProblem(kind: LibraryKind, file: { name: string; type: string; size: number }): string | null {
  if (!FILE_TYPES[kind].includes(file.type)) return kind === 'audio' ? 'Use an MP3 or M4A file.' : 'Use a PDF, Word, PowerPoint or Excel (.docx, .pptx, .xlsx) file. Save older formats in the newer one first.';
  if (file.size > LIBRARY_MAX_BYTES) return `That file is ${sizeLabel(file.size)}; the limit is 100 MB.`;
  return null;
}

/** Why a link cannot be saved, or null. */
export function linkProblem(url: string): string | null {
  const u = url.trim();
  if (!u) return 'Give the address.';
  if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)) return 'Use a full https:// address.';
  return null;
}

/** Resources grouped by topic, in their order; untopiced ones last, under "More". */
export function byTopic(items: LibraryItem[]): { topic: string; items: LibraryItem[] }[] {
  const groups = new Map<string, LibraryItem[]>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = item.topic?.trim() || '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const named = [...groups].filter(([k]) => k).map(([topic, list]) => ({ topic, items: list }));
  const rest = groups.get('');
  return rest ? [...named, { topic: named.length ? 'More' : 'Resources', items: rest }] : named;
}

/** Topics already used, for suggestions when adding another resource. */
export const topicsOf = (items: LibraryItem[]) => [...new Set(items.map((i) => i.topic?.trim()).filter((t): t is string => !!t))];
