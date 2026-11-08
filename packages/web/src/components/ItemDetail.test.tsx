import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemDetail } from './ItemDetail.js';
import { request } from '../lib/client.js';

const upload = vi.fn();
vi.mock('../lib/client.js', async importOriginal => ({ ...await importOriginal<typeof import('../lib/client.js')>(), request: vi.fn(), supabase: { storage: { from: () => ({ upload }) } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('item attachments', () => {
  it('reserves metadata before uploading with the user session', async () => {
    vi.mocked(request).mockImplementation(async (_token, _path, _schema, init) => init?.method === 'POST'
      ? { data: { id: 'a1', filename: 'part.txt', created_at: '2026-01-01', bucket: 'inventory-attachments', path: 'project/item/a1' }, pagination: undefined } as never
      : { data: [], pagination: undefined } as never);
    upload.mockResolvedValue({ error: null });
    render(<ItemDetail token="token" base="/organisations/o/projects/p" item={{ id: 'i', name: 'Bolt', sku: null, categoryId: null, quantity: 0, attributes: {} }} onBack={() => {}} />);
    const file = new File(['part'], 'part.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('＋ Upload file'), { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith('project/item/a1', file, { upsert: false }));
    expect(await screen.findByText('Attachment uploaded.')).toBeDefined();
    expect(vi.mocked(request).mock.calls.some(call => call[3]?.method === 'POST')).toBe(true);
  });
  it('keeps invalid custom field input and does not submit it', async () => {
    vi.mocked(request).mockResolvedValue({ data: [], pagination: undefined } as never);
    render(<ItemDetail token="token" base="/organisations/o/projects/p" item={{ id: 'i', name: 'Bolt', sku: null, categoryId: null, quantity: 0, attributes: {} }} onBack={() => {}} />);
    const input = screen.getByLabelText(/Custom fields/);
    fireEvent.change(input, { target: { value: '{broken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('valid JSON');
    expect((input as HTMLTextAreaElement).value).toBe('{broken');
    expect(vi.mocked(request).mock.calls.some(call => call[3]?.method === 'PATCH')).toBe(false);
  });
});
