import {
  AcademicCapIcon,
  CakeIcon,
  TvIcon,
  ComputerDesktopIcon,
  PhotoIcon,
  EnvelopeIcon,
  IdentificationIcon,
  QrCodeIcon,
  BellIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  HandRaisedIcon,
  MapPinIcon,
  MicrophoneIcon,
  PresentationChartBarIcon,
  PresentationChartLineIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon,
  SignalIcon,
  Squares2X2Icon,
  StarIcon,
  TicketIcon,
  TrophyIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

import type { StaffTier } from '@/lib/auth/session';

/** Any Heroicons outline icon; sized with a `size-*` class. */
export type HeroIcon = typeof Squares2X2Icon;

export type NavPage = {
  href: string;
  label: string;
  icon: HeroIcon;
  /** Tiers that see this page. Session operators only get the live-room tools. */
  tiers: readonly StaffTier[];
};
export type NavGroup = { label: string; icon: HeroIcon; pages: NavPage[] };

/** Platform pages: organisers only. */
const ADMIN = ['admin'] as const;
/** Running an event: organisers, and event organisers for their own events. */
const EVENTS = ['admin', 'event_admin'] as const;
/** The live day: everyone on the console. */
const STAFF = ['admin', 'event_admin', 'session_admin'] as const;

/** Every console page, grouped as the rail and menu show them. */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    icon: Squares2X2Icon,
    pages: [{ href: '/', label: 'Dashboard', icon: Squares2X2Icon, tiers: EVENTS }],
  },
  {
    label: 'Event setup',
    icon: CalendarDaysIcon,
    pages: [
      { href: '/events', label: 'Events', icon: CalendarDaysIcon, tiers: EVENTS },
      { href: '/programme', label: 'Programme', icon: ClipboardDocumentListIcon, tiers: EVENTS },
      { href: '/speakers', label: 'Speakers', icon: MicrophoneIcon, tiers: EVENTS },
      { href: '/venue', label: 'Venue & rooms', icon: MapPinIcon, tiers: EVENTS },
      { href: '/ticketing', label: 'Ticketing', icon: TicketIcon, tiers: EVENTS },
    ],
  },
  {
    label: 'People',
    icon: UsersIcon,
    pages: [
      { href: '/delegates', label: 'Delegates', icon: UsersIcon, tiers: EVENTS },
      { href: '/badges', label: 'Badges', icon: IdentificationIcon, tiers: EVENTS },
      { href: '/registration-list', label: 'Registration list', icon: ClipboardDocumentCheckIcon, tiers: ADMIN },
      { href: '/team', label: 'Team', icon: UserGroupIcon, tiers: ADMIN },
    ],
  },
  {
    label: 'Live',
    icon: SignalIcon,
    pages: [
      { href: '/check-in', label: 'Check-in desk', icon: QrCodeIcon, tiers: STAFF },
      { href: '/kiosk', label: 'Self check-in', icon: ComputerDesktopIcon, tiers: STAFF },
      { href: '/display', label: 'Display boards', icon: TvIcon, tiers: STAFF },
      { href: '/meals', label: 'Meals', icon: CakeIcon, tiers: EVENTS },
      { href: '/live', label: 'Live ops', icon: SignalIcon, tiers: STAFF },
      { href: '/captions', label: 'Captions', icon: ChatBubbleBottomCenterTextIcon, tiers: STAFF },
      { href: '/questions', label: 'Questions', icon: QuestionMarkCircleIcon, tiers: STAFF },
      { href: '/polls', label: 'Polls', icon: ChartBarIcon, tiers: STAFF },
      { href: '/pitchathon', label: 'Pitchathon', icon: HandRaisedIcon, tiers: EVENTS },
      { href: '/trivia', label: 'Trivia', icon: TrophyIcon, tiers: EVENTS },
      { href: '/discussions', label: 'Discussions', icon: ChatBubbleLeftRightIcon, tiers: STAFF },
    ],
  },
  {
    label: 'Engagement',
    icon: BellIcon,
    pages: [
      { href: '/notifications', label: 'Notifications', icon: BellIcon, tiers: EVENTS },
      { href: '/campaigns', label: 'Email campaigns', icon: EnvelopeIcon, tiers: EVENTS },
      { href: '/materials', label: 'Materials', icon: DocumentTextIcon, tiers: EVENTS },
      { href: '/library', label: 'Learning library', icon: AcademicCapIcon, tiers: EVENTS },
      { href: '/gallery', label: 'Gallery', icon: PhotoIcon, tiers: EVENTS },
      { href: '/feedback', label: 'Feedback', icon: StarIcon, tiers: EVENTS },
      { href: '/passport', label: 'Passport', icon: CheckBadgeIcon, tiers: EVENTS },
      { href: '/exhibition', label: 'Exhibition report', icon: PresentationChartBarIcon, tiers: EVENTS },
    ],
  },
  {
    label: 'Records',
    icon: BookOpenIcon,
    pages: [
      { href: '/certificates', label: 'Certificates & Purple Book', icon: BookOpenIcon, tiers: EVENTS },
      { href: '/analytics', label: 'Analytics', icon: PresentationChartLineIcon, tiers: ADMIN },
      { href: '/security', label: 'Security log', icon: ShieldCheckIcon, tiers: ADMIN },
    ],
  },
  {
    label: 'Settings',
    icon: Cog6ToothIcon,
    pages: [{ href: '/settings', label: 'Catalog & settings', icon: Cog6ToothIcon, tiers: ADMIN }],
  },
];

/** The groups and pages this tier may open; empty groups drop out. */
export function navFor(tier: StaffTier): NavGroup[] {
  return NAV.map((group) => ({ ...group, pages: group.pages.filter((page) => page.tiers.includes(tier)) })).filter(
    (group) => group.pages.length > 0,
  );
}

/** The signed-in user's own page, opened from the account menu rather than the sidebar. */
export const PROFILE_HREF = '/profile';

/** The navbar title for a path: its page's name, "Profile", or the product name. */
export function titleFor(pathname: string): string {
  if (pathname === PROFILE_HREF) return 'Profile';
  return pageFor(pathname)?.page.label ?? 'PIC Events';
}

/** One step of the breadcrumb trail; `section` marks a sidebar group, which has no page of its own. */
export type Crumb = { label: string; href?: string; section?: boolean };

/**
 * The breadcrumb trail to a path: Dashboard, the sidebar section, then the page. The dashboard
 * itself and unknown paths have a trail of one (or none), which is not shown.
 */
export function crumbsFor(pathname: string): Crumb[] {
  const home: Crumb = { label: 'Dashboard', href: '/' };
  if (pathname === PROFILE_HREF) return [home, { label: 'Profile', href: PROFILE_HREF }];
  const found = pageFor(pathname);
  if (!found) return [];
  if (found.page.href === '/') return [home];
  return [home, { label: found.group.label, section: true }, { label: found.page.label, href: found.page.href }];
}

/** The page a path belongs to, for the top bar title and the active rail item. */
export function pageFor(pathname: string): { group: NavGroup; page: NavPage } | null {
  for (const group of NAV) {
    for (const page of group.pages) {
      if (page.href === '/' ? pathname === '/' : pathname === page.href || pathname.startsWith(`${page.href}/`)) {
        return { group, page };
      }
    }
  }
  return null;
}
