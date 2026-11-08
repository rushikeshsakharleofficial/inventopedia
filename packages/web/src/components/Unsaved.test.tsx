import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnsavedProvider, useGuardedNavigation, useUnsaved } from './Unsaved.js';

function Example({ onLeave }: { onLeave: () => void }) {
  useUnsaved(true);
  const navigate = useGuardedNavigation();
  return <button onClick={() => navigate(onLeave)}>Go back</button>;
}
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; }; });
afterEach(cleanup);
describe('unsaved changes', () => {
  it('asks before leaving and preserves the original action until confirmed', () => {
    const leave = vi.fn(); render(<UnsavedProvider><Example onLeave={leave} /></UnsavedProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
