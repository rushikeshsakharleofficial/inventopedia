import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { Workspace } from './Workspace.js';

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), request: vi.fn() }));
vi.mock('../lib/client.js', async importOriginal => ({ ...await importOriginal<typeof import('../lib/client.js')>(), request: mocks.request, supabase: { auth: { signOut: mocks.signOut } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('workspace account', () => {
  it('shows sign-out failures instead of silently leaving the user signed in', async () => {
    mocks.request.mockResolvedValue({ data: [], pagination: undefined });
    mocks.signOut.mockResolvedValue({ error: new Error('Sign out failed') });
    const session = { access_token: 'token', user: { email: 'person@example.test' } } as unknown as Session;
    render(<Workspace session={session} />);
    await screen.findByText('Start with an organisation');
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    expect((await screen.findByRole('alert')).textContent).toContain('Sign out failed');
  });
  it('clears the previous project while switching organisations', async () => {
    let finishSecond: ((value: unknown) => void) | undefined;
    mocks.request.mockImplementation((_token: string, path: string) => {
      if (path === '/organisations') return Promise.resolve({ data: [{ id:'o1', name:'First', slug:'first' }, { id:'o2', name:'Second', slug:'second' }] });
      if (path.includes('/o1/projects?')) return Promise.resolve({ data: [{ id:'p1', name:'First project' }] });
      if (path.includes('/o2/projects?')) return new Promise(resolve => { finishSecond = resolve; });
      if (path.endsWith('/dashboard')) return Promise.resolve({ data: { items:0, categories:0, templates:0, movements:0, outOfStockItems:0 } });
      return Promise.resolve({ data: [] });
    });
    const session = { access_token: 'token', user: { email: 'person@example.test' } } as unknown as Session;
    render(<Workspace session={session} />);
    await screen.findByRole('option', { name: 'First project' });
    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: 'o2' } });
    expect(screen.queryByRole('option', { name: 'First project' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading your workspace');
    await waitFor(() => expect(finishSecond).toBeDefined());
    finishSecond?.({ data: [] });
    await screen.findByText('Create your first project');
  });
});
