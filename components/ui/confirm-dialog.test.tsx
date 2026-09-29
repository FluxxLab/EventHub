import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

beforeAll(() => {
  // jsdom may lack the modal API; stand in with the open attribute it toggles.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(cleanup);

function setup(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog open title="Log out?" confirmLabel="Log out" pendingLabel="Logging out…" onConfirm={onConfirm} onCancel={onCancel} {...props}>
      You&apos;ll need to sign in again.
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('confirms and cancels through its buttons', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels on Escape', () => {
    const { onCancel } = setup();
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cannot be confirmed twice or dismissed while the action runs', () => {
    const { onConfirm, onCancel } = setup({ pending: true });
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Logging out…', hidden: true });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
