import { api } from '@/lib/api/client';
import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';
import { DEMO_MODE } from '@/lib/demo';

/** One transcript line: when it was said, who said it (a name, or null), what was said. */
export type NamedLine = { at: number; name: string | null; text: string };

/** The rows of a CSV file (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A person's name, not a placeholder such as "Speaker 2" or "Mic 1". */
const realName = (name: string | undefined) => {
  const n = name?.trim();
  return n && !/^(speaker|mic|voice)\s*\d+$/i.test(n) ? n : null;
};

/** The transcript export (createdAt,room,speaker,mic,name,source,text) as named lines. */
export function transcriptLines(csv: string): NamedLine[] {
  const [head, ...rows] = parseCsv(csv);
  if (!head) return [];
  const col = (name: string) => head.indexOf(name);
  const [at, name, text] = [col('createdAt'), col('name'), col('text')];
  if (at < 0 || text < 0) return [];
  return rows.filter((r) => r[text]?.trim()).map((r) => ({ at: Date.parse(r[at] ?? ''), name: realName(name >= 0 ? r[name] : undefined), text: r[text]! }));
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Who said a call, from its session's named transcript: the line its quote comes from (a run of
 * five of its words), else the named line nearest the moment it was said (within a minute).
 * Null when the transcript does not say, so nothing is guessed.
 */
export function speakerOf(call: Pick<CallToAction, 'quote' | 'saidAt'>, lines: NamedLine[]): string | null {
  const quote = words(call.quote ?? '');
  if (quote.length >= 5) {
    const runs = new Set<string>();
    for (let i = 0; i + 5 <= quote.length; i++) runs.add(quote.slice(i, i + 5).join(' '));
    // a quote can run over two lines, so each line is read with the next
    for (let i = 0; i < lines.length; i++) {
      const joined = words(`${lines[i]!.text} ${lines[i + 1]?.text ?? ''}`);
      for (let j = 0; j + 5 <= joined.length; j++) {
        if (runs.has(joined.slice(j, j + 5).join(' '))) {
          const own = words(lines[i]!.text).length;
          const line = j < own ? lines[i]! : lines[i + 1]!;
          if (line.name) return line.name;
          break;
        }
      }
    }
  }
  const said = call.saidAt ? Date.parse(call.saidAt) : NaN;
  if (Number.isNaN(said)) return null;
  let best: NamedLine | null = null;
  for (const line of lines) {
    if (!line.name || Number.isNaN(line.at)) continue;
    if (Math.abs(line.at - said) <= 60_000 && (!best || Math.abs(line.at - said) < Math.abs(best.at - said))) best = line;
  }
  return best?.name ?? null;
}

/**
 * The calls with nobody named given the speaker their transcript shows. One transcript download
 * per session that needs it; a session whose transcript cannot be read is left as it is.
 */
export async function nameFromTranscripts(calls: CallToAction[]): Promise<CallToAction[]> {
  if (DEMO_MODE) return calls;
  const sessions = [...new Set(calls.filter((c) => c.sessionId && !c.proposedBy?.trim() && (c.quote || c.saidAt)).map((c) => c.sessionId!))];
  const transcripts = new Map<string, NamedLine[]>();
  await Promise.all(
    sessions.map(async (id) => {
      try {
        transcripts.set(id, transcriptLines(await api.getText(`/captions/${id}/transcript/export`, { format: 'csv' })));
      } catch {
        // drawn without names from it
      }
    }),
  );
  return calls.map((c) => {
    if (c.proposedBy?.trim()) return c;
    const lines = c.sessionId ? transcripts.get(c.sessionId) : undefined;
    const name = lines ? speakerOf(c, lines) : null;
    return name ? { ...c, proposedBy: name } : c;
  });
}
