import { cn } from '@/lib/utils';

/** An on/off switch (ARIA `switch`), PIC navy when on. Label it with `label` or `labelledBy`. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  labelledBy,
  tone = 'primary',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  labelledBy?: string;
  tone?: 'primary' | 'gold';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? (tone === 'gold' ? 'bg-gold' : 'bg-primary') : 'bg-[#d4d4d4]',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
