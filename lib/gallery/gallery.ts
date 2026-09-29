/**
 * Event photo galleries. Organisers make albums and upload photos here; delegates browse them in
 * the app. Each photo goes to storage twice: the original, and a small copy made in the browser
 * so the app's grid loads quickly on venue wifi.
 */

export type Album = {
  id: string;
  editionId: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  sortOrder: number;
  photos: number;
  coverPhotoId: string | null;
  coverUrl: string | null;
  createdAt: string;
};

export type Photo = {
  id: string;
  albumId: string;
  url: string | null;
  thumbUrl: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
};

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
/** Photos added to an album per request (the API's limit). */
export const PHOTO_BATCH = 50;
/** The small copy's longest side, in pixels: sharp on a phone grid of three across. */
export const THUMB_EDGE = 480;

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** Why a picked file cannot go in the gallery, or null. */
export function photoProblem(file: { name: string; type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return `${file.name}: use JPEG, PNG or WebP (export HEIC photos as JPEG first).`;
  if (file.size > PHOTO_MAX_BYTES) return `${file.name} is ${mb(file.size)}; the limit is 15 MB. Export it smaller.`;
  return null;
}

/** The small copy's size, keeping the shape: the longest side becomes `edge` (never enlarged). */
export function thumbSize(width: number, height: number, edge = THUMB_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A photo's size and its small copy (JPEG), made in the browser. Uses the photo's own
 * orientation, so phone pictures are not sideways.
 */
export async function prepare(file: File): Promise<{ width: number; height: number; thumb: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const size = thumbSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot make the small copy of a photo.');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const thumb = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The small copy could not be made.'))), 'image/jpeg', 0.82));
    return { width: bitmap.width, height: bitmap.height, thumb };
  } finally {
    bitmap.close();
  }
}

/** "24 photos", "1 photo", "No photos yet". */
export const photoCount = (n: number) => (n === 0 ? 'No photos yet' : `${n.toLocaleString('en-GB')} ${n === 1 ? 'photo' : 'photos'}`);
