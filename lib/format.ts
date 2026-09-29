/** Display formatting in one place, so every card shows money and counts the same way. */

/** "₦27.6M", "$5.73K": compact, for headline figures. */
export function moneyCompact(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${compact(amount)}`;
  }
}

/** "₦21,500": exact, for order values. */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

/** "1.28K", "456". */
export const compact = (value: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

/** "1,436". */
export const count = (value: number) => value.toLocaleString('en');

/** "11:32". */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "Just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'Just now';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  return plural(Math.round(hours / 24), 'day');
}

/** "+5.8%" / "-3.2%" / "new". */
export const percentChange = (change: number | null) => (change === null ? 'new' : `${Math.abs(change).toFixed(1)}%`);
