import { UserIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';

import { cn } from '@/lib/utils';

/** The design system's avatar sizes, in px. */
export type AvatarSize = 16 | 20 | 24 | 28 | 32 | 40 | 48 | 80;

/**
 * Per size: the initials' font size, the user icon's size, and the online dot's diameter, border
 * and offset from the corner (negative sits it slightly outside the circle).
 */
const SPEC: Record<AvatarSize, { text: string; icon: string; dot: number; ring: number; offset: number }> = {
  80: { text: 'text-[30px]', icon: 'size-12', dot: 16, ring: 2, offset: 2 },
  48: { text: 'text-xl', icon: 'size-8', dot: 12, ring: 1.5, offset: 1 },
  40: { text: 'text-lg', icon: 'size-6', dot: 10, ring: 1.5, offset: 0 },
  32: { text: 'text-base', icon: 'size-5', dot: 8, ring: 1.5, offset: 0 },
  28: { text: 'text-sm', icon: 'size-4', dot: 8, ring: 1.5, offset: 0 },
  24: { text: 'text-xs', icon: 'size-4', dot: 8, ring: 1.5, offset: -1 },
  20: { text: 'text-[10px]', icon: 'size-4', dot: 6, ring: 1.5, offset: -1 },
  16: { text: 'text-[8px]', icon: 'size-3', dot: 6, ring: 1.5, offset: -2 },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

/**
 * A person's avatar: their photo, else their initials, else a user icon, on pale navy. Optional
 * green online dot, and a soft halo when `focused` (mint for photos, grey otherwise).
 */
export function Avatar({
  name,
  src,
  size = 32,
  online = false,
  focused = false,
  className,
}: {
  name?: string;
  src?: string | null;
  size?: AvatarSize;
  online?: boolean;
  focused?: boolean;
  className?: string;
}) {
  const spec = SPEC[size];
  const letters = name ? initials(name) : '';
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }} title={name}>
      <span
        className={cn(
          'flex size-full items-center justify-center overflow-hidden rounded-full bg-primary-soft font-medium text-primary transition-shadow',
          spec.text,
          focused &&
            (src
              ? 'shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#eafff5]'
              : 'shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]'),
        )}
      >
        {src ? (
          <Image src={src} alt="" width={size} height={size} className="size-full object-cover" unoptimized />
        ) : letters ? (
          <span aria-hidden>{letters}</span>
        ) : (
          <UserIcon className={spec.icon} />
        )}
      </span>
      {online && (
        <span
          className="absolute rounded-full border-surface bg-success"
          style={{ width: spec.dot, height: spec.dot, right: spec.offset, bottom: spec.offset, borderWidth: spec.ring }}
          aria-label="Online"
          role="img"
        />
      )}
    </span>
  );
}
