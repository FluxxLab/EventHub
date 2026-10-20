/**
 * Session briefs: the organisers' brief for a session (its purpose and what it is asked to
 * address), kept on the session as text for the calls-to-action analysis and the rapporteur report
 * to read. A Word or PDF brief is read into text here, in the browser, so the API stores and sends
 * on plain text only. Organisers only: delegates never receive it.
 */

/** As the API allows (sessions/dto/set-session-brief.dto.ts). */
export const MAX_BRIEF_LENGTH = 50_000;
export const MAX_BRIEF_FILE_BYTES = 10 * 1024 * 1024;

export type SessionBrief = { text: string | null; fileName: string | null; updatedAt: string | null };
/** `GET /sessions/briefs?editionId=`: which sessions have one. */
export type BriefSummary = { sessionId: string; fileName: string | null; updatedAt: string | null };

/** Line endings, runs of spaces and blank lines tidied; at most one blank line between paragraphs. */
export function tidyBrief(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, (m) => (m.includes('\t') ? '\t' : ' ')).trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * A Word document's body (word/document.xml) as text: a line per paragraph, a table row's cells
 * separated by tabs, and numbered lists numbered ("1. The economic costs…"), since the numbering
 * is what the brief's "should address" points hang on.
 */
export function docxXmlToText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return '';
  const counters = new Map<string, number>();
  const lines: string[] = [];

  const runText = (p: Element) => {
    let out = '';
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.namespaceURI !== W) continue;
        if (child.localName === 't') out += child.textContent ?? '';
        else if (child.localName === 'tab') out += '\t';
        else if (child.localName === 'br' || child.localName === 'cr') out += '\n';
        else if (child.localName !== 'pPr' && child.localName !== 'rPr' && child.localName !== 'del') walk(child);
      }
    };
    walk(p);
    return out;
  };
  const paragraph = (p: Element) => {
    const numPr = p.getElementsByTagNameNS(W, 'numPr')[0];
    let prefix = '';
    if (numPr) {
      const id = numPr.getElementsByTagNameNS(W, 'numId')[0]?.getAttributeNS(W, 'val') ?? '0';
      const level = numPr.getElementsByTagNameNS(W, 'ilvl')[0]?.getAttributeNS(W, 'val') ?? '0';
      const key = `${id}:${level}`;
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      prefix = `${'  '.repeat(Number(level) || 0)}${n}. `;
    }
    return prefix + runText(p);
  };
  const block = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== W) continue;
      if (child.localName === 'p') lines.push(paragraph(child));
      else if (child.localName === 'tbl') {
        for (const row of Array.from(child.children).filter((c) => c.localName === 'tr')) {
          const cells = Array.from(row.children)
            .filter((c) => c.localName === 'tc')
            .map((tc) =>
              Array.from(tc.children)
                .filter((c) => c.localName === 'p')
                .map(paragraph)
                .join(' ')
                .trim(),
            );
          lines.push(cells.join('\t'));
        }
        lines.push('');
      } else if (child.localName === 'sdt' || child.localName === 'sdtContent') block(child);
    }
  };
  block(body);
  return tidyBrief(lines.join('\n'));
}

/** Why a chosen file cannot be read as a brief, or null when it can. */
export function briefFileProblem(file: { name: string; size: number }): string | null {
  if (file.size > MAX_BRIEF_FILE_BYTES) return 'That file is over 10 MB. A brief is usually a page or two.';
  if (/\.doc$/i.test(file.name)) return 'That is an old Word file (.doc). In Word choose File › Save As › Word Document (.docx), then choose it here.';
  if (!/\.(docx|pdf|txt|md)$/i.test(file.name)) return 'Choose a Word (.docx), PDF or text file.';
  return null;
}

/** A brief file's text: Word and PDF are read here in the browser; text files as they are. */
export async function readBriefFile(file: File): Promise<string> {
  const problem = briefFileProblem(file);
  if (problem) throw new Error(problem);
  if (/\.docx$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer()).catch(() => null);
    const xml = await zip?.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('That Word file could not be read. Open it in Word and save it again, or paste the brief’s text.');
    return docxXmlToText(xml);
  }
  if (/\.pdf$/i.test(file.name)) {
    // loaded only when a PDF is chosen, so the Programme page stays light
    const { extractText, getDocumentProxy } = await import('unpdf');
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      const tidy = tidyBrief(text);
      if (!tidy) throw new Error('empty');
      return tidy;
    } catch {
      throw new Error('No text could be read from that PDF. If it is a scan, open the original Word file instead, or paste the brief’s text.');
    }
  }
  return tidyBrief(await file.text());
}
