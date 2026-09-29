import { z } from 'zod';

/**
 * `GET /editions/:id/ticket-types`: the edition's tiers. Prices are whole units (naira, dollars),
 * not kobo. `price` null means "by invitation" (shown, not buyable); 0 means free.
 */
export type TicketType = {
  id: string;
  editionId: string;
  name: string;
  price: number | null;
  /** Per-currency prices in whole units; `NGN` mirrors `price`. */
  prices: Partial<Record<Currency, number>>;
  perks: string[];
  /** Printed on the ticket and used as its code prefix. */
  section: string;
  /** null is unlimited. */
  capacity: number | null;
  sold: number;
  isActive: boolean;
  sortOrder: number;
};

export const CURRENCIES = ['NGN', 'USD', 'GHS', 'KES', 'ZAR'] as const;
export type Currency = (typeof CURRENCIES)[number];
/** Currencies other than naira, which the tier's main price covers. */
export const EXTRA_CURRENCIES = CURRENCIES.filter((c) => c !== 'NGN') as Exclude<Currency, 'NGN'>[];

export type PriceMode = 'paid' | 'free' | 'invitation';
export const priceModeOf = (tier: Pick<TicketType, 'price'>): PriceMode => (tier.price === null ? 'invitation' : tier.price === 0 ? 'free' : 'paid');

/** "₦25,000", "$40". */
export function formatMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

/** Places left, or null when unlimited. Never negative, even if capacity was cut below sales. */
export const remaining = (tier: Pick<TicketType, 'capacity' | 'sold'>) => (tier.capacity === null ? null : Math.max(0, tier.capacity - tier.sold));

/** Share sold, 0–1, or null when unlimited. */
export const soldShare = (tier: Pick<TicketType, 'capacity' | 'sold'>) => (tier.capacity ? Math.min(1, tier.sold / tier.capacity) : null);

/* ------------------------------------------------------------------- form */

const wholeAmount = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v.replace(/,/g, '')) && Number(v.replace(/,/g, '')) <= 10_000_000), `${label} must be a whole number up to 10,000,000.`);

const toNumber = (v: string) => Number(v.replace(/,/g, ''));

export const tierSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the tier’s name.').max(100, 'Keep the name under 100 characters.'),
    section: z.string().trim().max(50, 'Keep the section under 50 characters.'),
    mode: z.enum(['paid', 'free', 'invitation']),
    price: wholeAmount('The price'),
    extra: z.object(Object.fromEntries(EXTRA_CURRENCIES.map((c) => [c, wholeAmount(`The ${c} price`)])) as Record<Exclude<Currency, 'NGN'>, ReturnType<typeof wholeAmount>>),
    capacity: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+$/.test(v.replace(/,/g, '')) && toNumber(v) >= 1), 'Capacity must be a whole number of at least 1, or blank for unlimited.'),
    perks: z
      .string()
      .refine((v) => v.split('\n').filter((l) => l.trim()).length <= 20, 'List at most 20 perks.')
      .refine((v) => v.split('\n').every((l) => l.trim().length <= 255), 'Keep each perk under 255 characters.'),
    isActive: z.boolean(),
  })
  .refine((v) => v.mode !== 'paid' || (v.price !== '' && toNumber(v.price) >= 1), { path: ['price'], message: 'Enter the naira price, or choose Free.' });

export type TierForm = z.input<typeof tierSchema>;

export const tierFormOf = (tier: TicketType | null): TierForm => ({
  name: tier?.name ?? '',
  section: tier?.section ?? 'General',
  mode: tier ? priceModeOf(tier) : 'paid',
  price: tier?.price ? String(tier.price) : '',
  extra: Object.fromEntries(EXTRA_CURRENCIES.map((c) => [c, tier?.prices[c] != null ? String(tier.prices[c]) : ''])) as TierForm['extra'],
  capacity: tier?.capacity ? String(tier.capacity) : '',
  perks: (tier?.perks ?? []).join('\n'),
  isActive: tier?.isActive ?? true,
});

/**
 * The form as a create or update body. Invitation tiers carry no price (null on update clears
 * it); free is 0. Other currencies are sent only when filled: the API merges `prices` on update,
 * so a price already set cannot be removed from here.
 */
export type TierBody = {
  name: string;
  section: string;
  /** Absent on a new invitation tier; null clears it on update. */
  price?: number | null;
  prices?: Partial<Record<Currency, number>>;
  capacity?: number;
  perks: string[];
  isActive: boolean;
};

export function toTierBody(form: z.output<typeof tierSchema>, { update }: { update: boolean }): TierBody {
  const extra = Object.fromEntries(EXTRA_CURRENCIES.filter((c) => form.mode === 'paid' && form.extra[c] !== '').map((c) => [c, toNumber(form.extra[c])]));
  const price = form.mode === 'paid' ? toNumber(form.price) : form.mode === 'free' ? 0 : null;
  return {
    name: form.name,
    section: form.section || 'General',
    ...(price !== null ? { price } : update ? { price: null } : {}),
    ...(Object.keys(extra).length ? { prices: extra } : {}),
    ...(form.capacity !== '' ? { capacity: toNumber(form.capacity) } : {}),
    perks: form.perks
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    isActive: form.isActive,
  };
}
