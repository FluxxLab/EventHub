'use client';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';

/** The one content type the API signs document uploads for. */
export const UPLOAD_TYPE = 'application/pdf';

/**
 * Sends a PDF straight to storage: the API signs an upload address, the browser PUTs the file
 * there (with progress), and the returned key is what the record stores (a material, the Purple Book).
 */
export function uploadPdf(file: File, onProgress: (fraction: number) => void): Promise<string> {
  return uploadFile(file, { presignPath: '/documents/upload-url', contentType: UPLOAD_TYPE }, onProgress);
}

/**
 * Any file straight to storage through a signed address the API hands out for it (the address is
 * bound to the content type). Returns the storage key to save on the record.
 */
export async function uploadFile(
  file: Blob,
  target: { presignPath: string; contentType: string; /** Sent when the API binds the size into the signature (gallery, library). */ sized?: boolean },
  onProgress: (fraction: number) => void,
): Promise<string> {
  if (DEMO_MODE) {
    for (let p = 0.2; p <= 1; p += 0.2) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 150));
    }
    const folder = target.presignPath.includes('certificate') ? 'certificates' : target.presignPath.includes('gallery') ? 'gallery' : target.presignPath.includes('library') ? 'library' : 'documents';
    return `${folder}/demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  const { uploadUrl, key: storageKey } = await api.post<{ uploadUrl: string; key: string }>(target.presignPath, {
    contentType: target.contentType,
    ...(target.sized ? { contentLength: file.size } : {}),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    // The signed URL is bound to this content type; anything else is refused by storage.
    xhr.setRequestHeader('Content-Type', target.contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The upload failed (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new Error('The upload could not reach storage. Check the connection and try again.'));
    xhr.send(file);
  });
  return storageKey;
}
