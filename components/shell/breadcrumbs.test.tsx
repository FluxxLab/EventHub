import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BreadcrumbProvider, Breadcrumbs, useSubPage } from '@/components/shell/breadcrumbs';

/** A page with a view inside it, like a campaign open in the editor. */
function CampaignsLike() {
  const [open, setOpen] = useState<string | null>('Your badge for GS-27');
  useSubPage(open, () => setOpen(null));
  return <p>{open ? 'editor' : 'list'}</p>;
}

afterEach(cleanup);

describe('Breadcrumbs', () => {
  it('leads from the dashboard through the section to the current page', () => {
    render(
      <BreadcrumbProvider>
        <Breadcrumbs pathname="/badges" />
      </BreadcrumbProvider>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toBe('DashboardPeopleBadges');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/');
    // the section has no page of its own, so it is not a link
    expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
    expect(screen.getByText('Badges').getAttribute('aria-current')).toBe('page');
  });

  it('adds the view open inside a page, and its page crumb goes back to the list', () => {
    render(
      <BreadcrumbProvider>
        <Breadcrumbs pathname="/campaigns" />
        <CampaignsLike />
      </BreadcrumbProvider>,
    );
    expect(screen.getByText('Your badge for GS-27').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Email campaigns' }));
    expect(screen.getByText('list')).toBeTruthy();
    expect(screen.queryByText('Your badge for GS-27')).toBeNull();
    expect(screen.getByText('Email campaigns').getAttribute('aria-current')).toBe('page');
  });

  it('shows nothing on the dashboard itself', () => {
    const { container } = render(
      <BreadcrumbProvider>
        <Breadcrumbs pathname="/" />
      </BreadcrumbProvider>,
    );
    expect(container.innerHTML).toBe('');
  });
});
