import { ExclamationCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { InputHTMLAttributes, ReactNode } from 'react';

import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The input box from the design system: 40px, #BDBDBD border, a soft grey halo on focus and a red
 * border with a pale red halo when invalid. Shared by text inputs, dropdowns and the date field
 * so every control looks the same.
 */
export const fieldBox = (state: { invalid?: boolean; focused?: boolean } = {}) =>
  cn(
    'flex h-10 w-full items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm text-[#525252] shadow-xs transition-shadow',
    state.invalid ? 'border-danger' : 'border-[#bdbdbd]',
    // The halo: grey normally, pale red when invalid. `focused` forces it for popover triggers.
    state.invalid
      ? cn('focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_var(--danger-soft)]', state.focused && 'shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_var(--danger-soft)]')
      : cn('focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]', state.focused && 'shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]'),
  );

/** Label above, control, then the helper text or (in red) the error below. */
export function Field({
  id,
  label,
  optional = false,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  /** Marks the label "(optional)" instead of spending a helper line on it. */
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {optional && <span className="ml-1 text-[#7c7c7c]">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-[#7c7c7c]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** The ids a control inside <Field> should point `aria-describedby` at. */
export const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/**
 * A text input in the field box: optional leading icon, and a trailing help icon (its tooltip is
 * `help`) that turns into a red warning icon while the field is invalid.
 */
export function TextInput({
  icon: Icon,
  prefix,
  invalid,
  help,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: HeroIcon;
  /** Short text before the value, such as a currency: "₦", "USD". */
  prefix?: string;
  invalid?: boolean;
  help?: string;
}) {
  return (
    <div className={cn(fieldBox({ invalid }), className)}>
      {Icon && <Icon className="size-5 shrink-0 text-[#525252]" />}
      {prefix && (
        <span className="-ml-0.5 shrink-0 border-r border-border pr-2 text-sm text-[#7c7c7c]" aria-hidden>
          {prefix}
        </span>
      )}
      <input
        {...props}
        aria-invalid={invalid || undefined}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#525252] outline-none placeholder:text-placeholder"
      />
      {invalid ? (
        <ExclamationCircleIcon className="size-4 shrink-0 text-danger" />
      ) : (
        help && <QuestionMarkCircleIcon className="size-4 shrink-0 text-[#7c7c7c]" title={help} />
      )}
    </div>
  );
}
