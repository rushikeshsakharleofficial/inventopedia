import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProjectView } from './ProjectView.js';
import { request, RequestError } from '../lib/client.js';

vi.mock('../lib/client.js', async importOriginal => ({ ...await importOriginal<typeof import('../lib/client.js')>(), request: vi.fn() }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.mocked(request).mockImplementation(async (_token, path) => {
    if (path.includes('/templates/t1/versions/v1')) return { data: { schema: { fields: [{ key: 'size', label: 'Size', type: 'number', required: true }] } }, pagination: undefined } as never;
    if (path.includes('/templates?')) return { data: [{ id: 't1', name: 'Parts', currentVersionId: 'v1' }], pagination: undefined } as never;
    return { data: [], pagination: undefined } as never;
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('inventory creation', () => {
  it('requires template fields and submits typed values', async () => {
    render(<ProjectView token="token" orgId="org" projectId="project" projectName="Workshop" section="items" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /new item/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Bolt' } });
    fireEvent.change(screen.getByLabelText(/Published template/), { target: { value: 'v1' } });
    const size = await screen.findByLabelText(/Size/);
    fireEvent.change(size, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /create item/i }));
    await waitFor(() => expect(vi.mocked(request).mock.calls.some(call => call[3]?.method === 'POST' && JSON.parse(String(call[3]?.body)).attributes.size === 12)).toBe(true));
  });
});

describe('stock movements', () => {
  it('reuses the same reference after an uncertain failure', async () => {
    const bodies: { referenceId: string }[] = [];
    vi.mocked(request).mockImplementation(async (_token, path, _schema, init) => {
      if (init?.method === 'POST') { bodies.push(JSON.parse(String(init.body)) as { referenceId: string }); throw new RequestError('Unavailable', 500); }
      if (path.includes('/items?')) return { data: [{ id: 'item-1', name: 'Bolt' }], pagination: undefined } as never;
      return { data: [], pagination: undefined } as never;
    });
    render(<ProjectView token="token" orgId="org" projectId="project" projectName="Workshop" section="movements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /record movement/i }));
    fireEvent.change(await screen.findByLabelText('Item'), { target: { value: 'item-1' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record movement' }));
    await screen.findAllByText(/result is uncertain/i);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record movement' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0].referenceId).toBeTruthy();
    expect(bodies[1].referenceId).toBe(bodies[0].referenceId);
  });
});
