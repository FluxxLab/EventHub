import type { DashboardView, DayValue } from '@/lib/dashboard/types';

/** Sample dashboard for demo mode: a GS-27 build-up month, shaped exactly like the API response. */
function series(days: number, start: number, wobble: number, trend: number): DayValue[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const value = Math.max(0, Math.round(start + trend * i + wobble * Math.sin(i * 1.3) + wobble * 0.5 * Math.cos(i * 2.1)));
    return { day: d.toISOString().slice(0, 10), value };
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const DEMO_DASHBOARD: DashboardView = {
  generatedAt: new Date().toISOString(),
  edition: {
    id: 'demo-gs27',
    name: 'GS-27 Gender & Inclusion Summit',
    shortName: 'GS-27',
    startsAt: '2027-09-07T08:00:00+01:00',
    endsAt: '2027-09-08T17:00:00+01:00',
    status: 'announced',
  },
  currency: 'NGN',
  kpis: {
    ticketsSold: { current: 1284, previous: 912, currentLabel: 'Aug 2027', previousLabel: 'Jul 2027' },
    averageOrder: { current: 21500, previous: 19800, currentLabel: 'Aug 2027', previousLabel: 'Jul 2027' },
    revenue: { current: 27600000, previous: 18050000, currentLabel: 'Aug 2027', previousLabel: 'Jul 2027' },
    delegates: { current: 1172, previous: 840, currentLabel: 'Aug 2027', previousLabel: 'Jul 2027' },
  },
  orderStatus: { paid: 1046, pending: 38, cancelled: 21, ticketsIssued: 2196, admitted: 0, unclaimedHolders: 164 },
  geography: [
    { country: 'NG', name: 'Nigeria', orders: 846, tickets: 1810 },
    { country: 'GH', name: 'Ghana', orders: 74, tickets: 131 },
    { country: 'KE', name: 'Kenya', orders: 41, tickets: 66 },
    { country: 'ZA', name: 'South Africa', orders: 28, tickets: 44 },
    { country: 'GB', name: 'United Kingdom', orders: 31, tickets: 78 },
    { country: 'US', name: 'United States', orders: 26, tickets: 67 },
  ],
  tables: {
    screens: [
      { label: 'Home', value: 18420, change: 12.4 },
      { label: 'Event details', value: 9310, change: 8.1 },
      { label: 'Checkout', value: 4120, change: 21.7 },
      { label: 'My Tickets', value: 3980, change: 5.2 },
      { label: 'Schedule', value: 2210, change: -3.4 },
      { label: 'Delegates', value: 1450, change: 17.9 },
    ],
    countries: [
      { label: 'Nigeria', value: 1810, change: 34.2 },
      { label: 'Ghana', value: 131, change: 12.1 },
      { label: 'United Kingdom', value: 78, change: -4.9 },
      { label: 'United States', value: 67, change: 9.8 },
      { label: 'Kenya', value: 66, change: null },
      { label: 'South Africa', value: 44, change: -12.0 },
    ],
    tiers: [
      { label: 'Standard', value: 1640, change: 28.3 },
      { label: 'VIP', value: 312, change: 41.0 },
      { label: 'Student', value: 148, change: 6.4 },
      { label: 'Press', value: 52, change: -8.8 },
      { label: 'Group (5+)', value: 44, change: 15.2 },
    ],
  },
  spark: {
    revenue: { total: 27600000, paidOrders: 1046, daily: series(14, 1400000, 450000, 60000) },
    activeDelegates: { today: 456, onlineNow: 41, daily: series(14, 310, 70, 9) },
    engagement: {
      rate: 38.6,
      daily: series(14, 40, 18, 2).map((d, i) => ({ day: d.day, questions: d.value, pollVotes: Math.round(d.value * 1.6 + 10 * Math.sin(i)) })),
    },
  },
  activity: [
    { at: minutesAgo(4), type: 'delegate_registered', description: 'Registration matched list entry — tier vip granted', severity: 'info' },
    { at: minutesAgo(22), type: 'tier_changed', description: 'Delegate access tier changed by admin', severity: 'warning' },
    { at: minutesAgo(51), type: 'delegate_reported', description: 'Delegate reported for spam', severity: 'warning' },
    { at: minutesAgo(96), type: 'password_changed', description: 'Password changed', severity: 'info' },
    { at: minutesAgo(140), type: 'google_linked', description: 'Google sign-in linked to an existing account', severity: 'info' },
    { at: minutesAgo(210), type: 'refresh_token_reuse', description: 'Refresh token reused; session revoked', severity: 'critical' },
  ],
  recentOrders: [
    { at: minutesAgo(3), id: 'o1', buyer: 'Amina Yusuf', total: 60000, currency: 'NGN', tickets: 1 },
    { at: minutesAgo(11), id: 'o2', buyer: 'Tunde Bakare', total: 75000, currency: 'NGN', tickets: 5 },
    { at: minutesAgo(27), id: 'o3', buyer: 'Grace Obi', total: 15500, currency: 'NGN', tickets: 1 },
    { at: minutesAgo(48), id: 'o4', buyer: 'Kwame Mensah', total: 258, currency: 'GHS', tickets: 1 },
    { at: minutesAgo(80), id: 'o5', buyer: 'Chinwe Okoro', total: 31000, currency: 'NGN', tickets: 2 },
    { at: minutesAgo(133), id: 'o6', buyer: 'Sarah Kimani', total: 4100, currency: 'KES', tickets: 1 },
  ],
  recentDelegates: [
    { id: 'd1', name: 'Amina Yusuf', avatarUrl: null },
    { id: 'd2', name: 'Tunde Bakare', avatarUrl: null },
    { id: 'd3', name: 'Grace Obi', avatarUrl: null },
    { id: 'd4', name: 'Kwame Mensah', avatarUrl: null },
  ],
};
