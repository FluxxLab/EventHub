'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

/** The browser's own QR reader (Chrome on Android, ChromeOS, macOS), or null where there is none (Safari). */
const nativeDetector = (): Detector | null => {
  const Barcode = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  try {
    return Barcode ? new Barcode({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
};

/** Whether this device has a camera API at all; call after mount. */
export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * The back camera reading QR codes: the browser's reader where there is one, otherwise jsQR on
 * frames drawn to a canvas, so it works on iPhones too. The same code held up is read once until it
 * has been out of view for a few seconds.
 */
export function QrScanner({
  onCode,
  onClose,
  facing = 'environment',
  className,
}: {
  onCode: (text: string) => void;
  /** Without it there is no close button (a self check-in kiosk keeps its camera on). */
  onClose?: () => void;
  /** `user`: the front camera, for a tablet facing the person; shown mirrored, as a selfie is. */
  facing?: 'environment' | 'user';
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const read = async (el: HTMLVideoElement, native: Detector | null): Promise<string | null> => {
      if (native) return (await native.detect(el).catch(() => []))[0]?.rawValue ?? null;
      if (!context || !el.videoWidth) return null;
      // a smaller frame reads faster and a QR at arm's length is still plenty of pixels
      const scale = Math.min(1, 640 / el.videoWidth);
      canvas.width = Math.round(el.videoWidth * scale);
      canvas.height = Math.round(el.videoHeight * scale);
      context.drawImage(el, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      } catch {
        if (live) setProblem('The camera is blocked. Allow it for this site in the browser settings, then try again.');
        return;
      }
      const el = video.current;
      if (!live || !el) return;
      el.srcObject = stream;
      await el.play().catch(() => undefined);
      const native = nativeDetector();
      let last = '';
      let lastSeen = 0;
      const tick = async () => {
        if (!live) return;
        const text = await read(el, native);
        const now = Date.now();
        if (text && (text !== last || now - lastSeen > 4000)) handler.current(text);
        if (text) {
          last = text;
          lastSeen = now;
        }
        timer = setTimeout(() => void tick(), native ? 250 : 180);
      };
      void tick();
    };
    void start();
    return () => {
      live = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-ink', className)}>
      <video ref={video} muted playsInline className={cn('aspect-[4/3] w-full object-cover', facing === 'user' && '-scale-x-100')} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <div className="size-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      </div>
      {problem && <p className="absolute inset-x-0 bottom-0 bg-danger px-4 py-2 text-sm text-white">{problem}</p>}
      {onClose && (
        <button type="button" onClick={onClose} className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close camera">
          <XMarkIcon className="size-5" />
        </button>
      )}
    </div>
  );
}
