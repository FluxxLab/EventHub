import { describe, expect, it } from 'vitest';

import { changeOf } from '@/components/dashboard/change-badge';
import { crumbsFor, navFor, pageFor, titleFor } from '@/lib/nav';

describe('navFor', () => {
  it('gives organisers every group', () => {
    expect(navFor('admin').map((g) => g.label)).toEqual(['Overview', 'Event setup', 'People', 'Live', 'Engagement', 'Records', 'Settings']);
  });

  it('gives session operators only the live-room tools', () => {
    const groups = navFor('session_admin');
    expect(groups.map((g) => g.label)).toEqual(['Live']);
    expect(groups[0]!.pages.map((p) => p.href)).toEqual(['/check-in', '/kiosk', '/display', '/live', '/captions', '/questions', '/polls', '/discussions']);
  });

  it('gives event organisers the event-running pages and none of the platform ones', () => {
    const hrefs = navFor('event_admin').flatMap((g) => g.pages.map((p) => p.href));
    expect(hrefs).toEqual([
      '/',
      '/events',
      '/programme',
      '/speakers',
      '/venue',
      '/ticketing',
      '/delegates',
      '/badges',
      '/check-in',
      '/kiosk',
      '/display',
      '/meals',
      '/live',
      '/captions',
      '/questions',
      '/polls',
      '/pitchathon',
      '/trivia',
      '/discussions',
      '/notifications',
      '/campaigns',
      '/materials',
      '/library',
      '/gallery',
      '/feedback',
      '/passport',
      '/exhibition',
      '/certificates',
    ]);
    for (const platform of ['/team', '/analytics', '/security', '/settings']) {
      expect(hrefs).not.toContain(platform);
    }
  });
});

describe('pageFor', () => {
  it('matches the dashboard only at the root', () => {
    expect(pageFor('/')?.page.label).toBe('Dashboard');
    expect(pageFor('/unknown')).toBeNull();
  });

  it('matches nested paths to their page', () => {
    expect(pageFor('/delegates/abc')?.page.label).toBe('Delegates');
    expect(pageFor('/delegates-archive')).toBeNull();
  });
});

describe('crumbsFor', () => {
  it('leads from the dashboard through the section to the page', () => {
    expect(crumbsFor('/badges')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'People', section: true },
      { label: 'Badges', href: '/badges' },
    ]);
    expect(crumbsFor('/delegates/abc').at(-1)).toEqual({ label: 'Delegates', href: '/delegates' });
    expect(crumbsFor('/profile')).toEqual([{ label: 'Dashboard', href: '/' }, { label: 'Profile', href: '/profile' }]);
    expect(crumbsFor('/')).toEqual([{ label: 'Dashboard', href: '/' }]);
    expect(crumbsFor('/nowhere')).toEqual([]);
  });
});

describe('titleFor', () => {
  it('names nav pages, the profile, and falls back to the product', () => {
    expect(titleFor('/delegates')).toBe('Delegates');
    expect(titleFor('/profile')).toBe('Profile');
    expect(titleFor('/nowhere')).toBe('PIC Events');
  });
});

describe('changeOf', () => {
  it('rounds to one decimal', () => {
    expect(changeOf(1284, 912)).toBe(40.8);
    expect(changeOf(90, 100)).toBe(-10);
  });

  it('is null when there is nothing to compare against', () => {
    expect(changeOf(5, 0)).toBeNull();
  });
});
