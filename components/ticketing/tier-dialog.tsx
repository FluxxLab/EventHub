'use client';

import { CheckCircleIcon, TagIcon, TicketIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { EXTRA_CURRENCIES, tierFormOf, tierSchema, toTierBody, type PriceMode, type TicketType, type TierForm } from '@/lib/ticketing/ticketing';
import { useTierMutations } from '@/lib/ticketing/use-ticketing';

type Errors = Partial<Record<keyof TierForm, string>>;

const MODES: { value: PriceMode; label: string; hint: string }[] = [
  { value: 'paid', label: 'Paid', hint: 'Bought at checkout' },
  { value: 'free', label: 'Free', hint: 'Claimed at checkout, no charge' },
  { value: 'invitation', label: 'By invitation', hint: 'Listed, not for sale' },
];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#7c7c7c]">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Add or edit a ticket tier: what it is, how it is priced, how many there are, and whether it is on sale. */
export function TierDialog({ open, onClose, editionId, tier }: { open: boolean; onClose: () => void; editionId: string; tier: TicketType | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [form, setForm] = useState<TierForm>(() => tierFormOf(tier));
  const [errors, setErrors] = useState<Errors>({});
  const { create, update } = useTierMutations(editionId);
  const toast = useToast();
  const editing = !!tier;
  const mutation = editing ? update : create;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Each opening starts from the tier it was opened for.
  const [openedFor, setOpenedFor] = useState<TicketType | null | undefined>(undefined);
  // Other currencies start open only when the tier already has some.
  const [showCurrencies, setShowCurrencies] = useState(false);
  if (open && openedFor !== tier) {
    setOpenedFor(tier);
    setForm(tierFormOf(tier));
    setErrors({});
    setShowCurrencies(!!tier && EXTRA_CURRENCIES.some((c) => tier.prices[c] != null));
  }

  const reset = () => {
    create.reset();
    update.reset();
    setOpenedFor(undefined);
    onClose();
  };
  const close = () => {
    if (!mutation.isPending) reset();
  };
  const set = <K extends keyof TierForm>(key: K, value: TierForm[K]) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = tierSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof TierForm] ??= issue.message;
      setErrors(next);
      return;
    }
    const body = toTierBody(parsed.data, { update: editing });
    const done = () => {
      reset();
      toast.push({
        title: editing ? 'Tier updated' : 'Tier added',
        leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' },
        body: body.isActive ? `${body.name} is on sale.` : `${body.name} is saved and off sale.`,
      });
    };
    if (editing) update.mutate({ id: tier!.id, body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  const id = (name: string) => `${baseId}-${name}`;
  const capacityBelowSold = editing && form.capacity !== '' && Number(form.capacity.replace(/,/g, '')) < tier!.sold;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('title')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('lg')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={TicketIcon}
            title={editing ? `Edit ${tier!.name}` : 'Add ticket tier'}
            titleId={id('title')}
            subtitle={editing ? 'Price changes apply to new orders; paid orders keep the price they paid.' : 'A kind of ticket delegates can buy or be given.'}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">
          <Section title="Details" description="The name at checkout, and the section printed on the ticket.">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field id={id('name')} label="Tier name" error={errors.name}>
                <TextInput
                  id={id('name')}
                  icon={TicketIcon}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Standard"
                  invalid={!!errors.name}
                  aria-describedby={describedBy(id('name'), errors.name)}
                  autoFocus
                />
              </Field>
              <Field id={id('section')} label="Section" error={errors.section}>
                <TextInput
                  id={id('section')}
                  icon={TagIcon}
                  value={form.section}
                  onChange={(e) => set('section', e.target.value)}
                  placeholder="General"
                  invalid={!!errors.section}
                  help="Printed on the ticket and used in its code, like PIC-VIP-4F2A."
                />
              </Field>
            </div>
            <Field id={id('perks')} label="What it includes" optional error={errors.perks} hint="One per line, shown under the tier at checkout.">
              <textarea
                id={id('perks')}
                rows={3}
                value={form.perks}
                onChange={(e) => set('perks', e.target.value)}
                placeholder={'All plenaries and parallel sessions\nLunch both days'}
                aria-describedby={describedBy(id('perks'), errors.perks, 'hint')}
                className={cn(
                  'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm leading-5 text-[#525252] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                  errors.perks ? 'border-danger' : 'border-[#bdbdbd]',
                )}
              />
            </Field>
          </Section>

          <Section title="Pricing" description="In whole units (naira, dollars). Other currencies are for delegates paying from abroad.">
            <div role="radiogroup" aria-label="How it is priced" className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={form.mode === m.value}
                  onClick={() => set('mode', m.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition-colors',
                    form.mode === m.value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-soft',
                  )}
                >
                  <span className={cn('block text-sm', form.mode === m.value ? 'font-medium text-primary' : 'text-ink')}>{m.label}</span>
                  <span className="block text-xs text-[#7c7c7c]">{m.hint}</span>
                </button>
              ))}
            </div>
            {form.mode === 'paid' && (
              <>
                <Field id={id('price')} label="Price" error={errors.price} className="sm:max-w-xs">
                  <TextInput
                    id={id('price')}
                    prefix="₦"
                    inputMode="numeric"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="25,000"
                    invalid={!!errors.price}
                    aria-describedby={describedBy(id('price'), errors.price)}
                  />
                </Field>
                {/* Most tiers are naira only, so other currencies stay folded away until wanted. */}
                {showCurrencies ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm text-ink">
                      Prices in other currencies <span className="text-[#7c7c7c]">(optional)</span>
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {EXTRA_CURRENCIES.map((c) => (
                        <TextInput
                          key={c}
                          prefix={c}
                          inputMode="numeric"
                          value={form.extra[c]}
                          onChange={(e) => set('extra', { ...form.extra, [c]: e.target.value })}
                          placeholder="Not sold in this currency"
                          aria-label={`Price in ${c}`}
                        />
                      ))}
                    </div>
                    {errors.extra && <p className="text-xs text-danger">{errors.extra}</p>}
                    <p className="text-xs text-[#7c7c7c]">A buyer abroad pays in their currency only if every tier in their basket has a price in it; otherwise in naira.</p>
                  </fieldset>
                ) : (
                  <button type="button" onClick={() => setShowCurrencies(true)} className="self-start text-sm text-primary hover:underline">
                    + Add prices in other currencies
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="Availability" description="How many there are, and whether delegates can buy it right now.">
            <Field
              id={id('capacity')}
              label="Capacity"
              optional
              error={errors.capacity}
              hint={capacityBelowSold ? `Below the ${tier!.sold} already sold: no more can be bought.` : 'Leave blank for unlimited.'}
              className="sm:max-w-xs"
            >
              <TextInput
                id={id('capacity')}
                icon={UsersIcon}
                inputMode="numeric"
                value={form.capacity}
                onChange={(e) => set('capacity', e.target.value)}
                placeholder="Unlimited"
                invalid={!!errors.capacity}
                aria-describedby={describedBy(id('capacity'), errors.capacity, 'hint')}
              />
            </Field>
            {/* A settings row: what it does on the left, the switch on the right. */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div id={id('onsale-label')}>
                <p className="text-sm text-ink">On sale</p>
                <p className="text-xs text-[#7c7c7c]">
                  {form.isActive ? 'Listed at checkout now.' : 'Hidden from checkout; tickets already sold stay valid. Switch it back on any time.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                aria-labelledby={id('onsale-label')}
                onClick={() => set('isActive', !form.isActive)}
                className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', form.isActive ? 'bg-success' : 'bg-[#d4d4d4]')}
              >
                <span
                  className={cn(
                    'absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform',
                    form.isActive ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          </Section>

          {mutation.error && (
            <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {mutation.error.message}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={mutation.isPending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className={buttonClass()}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save tier' : 'Add tier'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
