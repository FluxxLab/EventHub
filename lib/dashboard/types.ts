/** `GET /admin/dashboard`: everything the organiser dashboard shows, in one response. */

export type Compare = { current: number; previous: number; currentLabel: string; previousLabel: string };
/** `change`: % against the previous period, one decimal; null when the previous period was zero. */
export type TableRow = { label: string; value: number; change: number | null };
export type DayValue = { day: string; value: number };

export type DashboardView = {
  generatedAt: string;
  edition: { id: string; name: string; shortName: string; startsAt: string; endsAt: string; status: string } | null;
  /** The currency most paid orders used; every single-currency figure is in it. */
  currency: string;
  kpis: {
    ticketsSold: Compare;
    averageOrder: Compare;
    revenue: Compare;
    delegates: Compare;
  };
  orderStatus: {
    paid: number;
    pending: number;
    cancelled: number;
    ticketsIssued: number;
    admitted: number;
    unclaimedHolders: number;
  };
  /** Paid orders by billing country (ISO 3166-1 alpha-2), most first. */
  geography: { country: string; name: string; orders: number; tickets: number }[];
  tables: { screens: TableRow[]; countries: TableRow[]; tiers: TableRow[] };
  spark: {
    revenue: { total: number; paidOrders: number; daily: DayValue[] };
    /** onlineNow: delegates with the app connected right now (live, not cached); 0 when nobody is. */
    activeDelegates: { today: number; onlineNow: number; daily: DayValue[] };
    engagement: { rate: number; daily: { day: string; questions: number; pollVotes: number }[] };
  };
  activity: { at: string; type: string; description: string; severity: 'info' | 'warning' | 'critical' }[];
  recentOrders: { at: string; id: string; buyer: string; total: number; currency: string; tickets: number }[];
  recentDelegates: { id: string; name: string; avatarUrl: string | null }[];
};
