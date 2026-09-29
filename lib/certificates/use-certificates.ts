'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { DEFAULT_CODE, DEFAULT_NAME, type CertificateDesign, type CertificateTemplate, type PurpleBook, type TextPlacement, type Verification } from '@/lib/certificates/certificates';
import { uploadFile, uploadPdf } from '@/lib/uploads';

const BOOK = ['admin', 'purple-book'] as const;

let demoBook: PurpleBook | null = {
  key: 'purple-book',
  title: 'The Purple Book 2027',
  url: 'https://bucket.s3.amazonaws.com/documents/pb?X-Amz-Signature=demo',
  sizeLabel: '6.8 MB',
  updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
};

/** The published Purple Book, or null before one is published (the API answers 404). */
export function usePurpleBook() {
  return useQuery({
    queryKey: BOOK,
    queryFn: async ({ signal }) => {
      if (DEMO_MODE) return demoBook;
      try {
        return await api.get<PurpleBook>('/documents/purple-book', undefined, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

/** Publish or replace the Purple Book: a new PDF is uploaded first, then the document points at it. */
export function usePublishPurpleBook(onProgress: (fraction: number | null) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, sizeLabel, file, link }: { title: string; sizeLabel: string; file?: File; link?: string }) => {
      let url = link;
      if (file) {
        onProgress(0);
        try {
          url = await uploadPdf(file, onProgress);
        } finally {
          onProgress(null);
        }
      }
      if (!url) throw new Error('Choose a PDF or give a link.');
      const body = { title, url, sizeLabel: sizeLabel || undefined };
      if (DEMO_MODE) {
        demoBook = { key: 'purple-book', title, url: file ? `https://bucket.s3.amazonaws.com/${url}?X-Amz-Signature=demo` : url, sizeLabel: sizeLabel || null, updatedAt: new Date().toISOString() };
        return demoBook;
      }
      return api.put<PurpleBook>('/documents/purple-book', body);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: BOOK }),
  });
}

/** Checks a certificate code the way a verifier would (the route is public). */
export function useVerifyCertificate() {
  return useMutation({
    mutationFn: (code: string): Promise<Verification> => {
      if (!DEMO_MODE) return api.get<Verification>(`/certificates/verify/${encodeURIComponent(code)}`);
      return Promise.resolve(
        code === 'GS27-K7M2P-X4QRT' ? { valid: true, delegateName: 'Ngozi Eze', issuedAt: '2027-09-08T16:20:00Z', event: 'GS-27 Gender Summit' } : { valid: false },
      );
    },
  });
}

/* ------------------------------------------------------- certificate design */

const designKey = (editionId: string | undefined) => ['admin', 'certificate-design', editionId] as const;

/** A stand-in certificate for demo mode: border, heading and an empty line for the name. */
const DEMO_ARTWORK = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3508 2480" preserveAspectRatio="none">
<rect width="3508" height="2480" fill="#fbf8f1"/>
<rect x="110" y="110" width="3288" height="2260" fill="none" stroke="#002d74" stroke-width="18"/>
<rect x="160" y="160" width="3188" height="2160" fill="none" stroke="#c9a227" stroke-width="6"/>
<text x="1754" y="560" text-anchor="middle" font-family="Georgia,serif" font-size="150" letter-spacing="14" fill="#002d74">CERTIFICATE OF PARTICIPATION</text>
<text x="1754" y="900" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="84" fill="#525252">This is to certify that</text>
<line x1="854" y1="1400" x2="2654" y2="1400" stroke="#c9a227" stroke-width="5"/>
<text x="1754" y="1600" text-anchor="middle" font-family="Georgia,serif" font-size="78" fill="#525252">took part in the GS-27 Gender Summit, Abuja, 7 – 8 September 2027</text>
<line x1="600" y1="2020" x2="1300" y2="2020" stroke="#7c7c7c" stroke-width="4"/>
<text x="950" y="2100" text-anchor="middle" font-family="Georgia,serif" font-size="58" fill="#525252">Executive Director</text>
<line x1="2208" y1="2020" x2="2908" y2="2020" stroke="#7c7c7c" stroke-width="4"/>
<text x="2558" y="2100" text-anchor="middle" font-family="Georgia,serif" font-size="58" fill="#525252">Programme Lead</text>
</svg>`)}`;

const demoDesigns = new Map<string, CertificateDesign>();
function demoDesign(editionId: string): CertificateDesign {
  if (!demoDesigns.has(editionId)) {
    // the current summit has a design; the others show the empty state
    const first = demoDesigns.size === 0;
    demoDesigns.set(
      editionId,
      first
        ? {
            template: { key: 'certificates/demo', contentType: 'image/png', width: 3508, height: 2480, name: DEFAULT_NAME, code: DEFAULT_CODE, updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
            artworkUrl: DEMO_ARTWORK,
          }
        : { template: null, artworkUrl: null },
    );
  }
  return demoDesigns.get(editionId)!;
}

/** The edition's certificate design and a signed link to its artwork (both null before one is uploaded). */
export function useCertificateDesign(editionId: string | undefined) {
  return useQuery({
    queryKey: designKey(editionId),
    enabled: Boolean(editionId),
    // the artwork link is signed for a limited time; refetching keeps it fresh
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoDesign(editionId!)) : api.get<CertificateDesign>(`/editions/${editionId}/certificate`, undefined, signal)),
  });
}

export type DesignArtwork = { file?: File; key?: string; contentType: 'image/png' | 'image/jpeg'; width: number; height: number; previewUrl: string };

/** Saves the design: new artwork is uploaded first, then the edition points at it with the text placements. */
export function useSaveCertificateDesign(editionId: string | undefined, onProgress: (fraction: number | null) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ artwork, name, code }: { artwork: DesignArtwork; name: TextPlacement; code: TextPlacement | null }) => {
      if (!editionId) throw new Error('Choose an event first.');
      let key = artwork.key;
      if (artwork.file) {
        onProgress(0);
        try {
          key = await uploadFile(artwork.file, { presignPath: `/editions/${editionId}/certificate/upload-url`, contentType: artwork.contentType }, onProgress);
        } finally {
          onProgress(null);
        }
      }
      if (!key) throw new Error('Upload the artwork first.');
      const body = { key, contentType: artwork.contentType, width: artwork.width, height: artwork.height, name, code };
      if (DEMO_MODE) {
        const template: CertificateTemplate = { ...body, updatedAt: new Date().toISOString() };
        demoDesigns.set(editionId, { template, artworkUrl: artwork.previewUrl });
        return template;
      }
      return api.put<CertificateTemplate>(`/editions/${editionId}/certificate`, body);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: designKey(editionId) }),
  });
}

/** Takes the design down: delegates can no longer download a certificate for the edition. */
export function useRemoveCertificateDesign(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!editionId) return;
      if (DEMO_MODE) {
        demoDesigns.set(editionId, { template: null, artworkUrl: null });
        return;
      }
      await api.delete(`/editions/${editionId}/certificate`);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: designKey(editionId) }),
  });
}

/** The saved design rendered by the API with a sample name, exactly as a delegate would get it. */
export async function fetchSampleCertificate(editionId: string, name: string): Promise<Blob> {
  if (DEMO_MODE) throw new Error('Sample PDFs are rendered by the API, so they are not available in demo mode.');
  return api.getBlob(`/editions/${editionId}/certificate/sample.pdf`, { name });
}
