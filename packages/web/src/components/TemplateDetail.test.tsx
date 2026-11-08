import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TemplateDetail } from './TemplateDetail.js';
import { request } from '../lib/client.js';

vi.mock('../lib/client.js', async importOriginal => ({ ...await importOriginal<typeof import('../lib/client.js')>(), request: vi.fn() }));
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; }; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('template versions', () => {
  it('creates a draft and publishes it only after confirmation', async () => {
    const versions: { id: string; version: number; publishedAt: string | null; schema: { fields: never[] } }[] = [];
    vi.mocked(request).mockImplementation(async (_token, path, _schema, init) => {
      if (init?.method === 'POST' && path.endsWith('/versions')) { const version = { id: 'v1', version: 1, publishedAt: null, schema: { fields: [] } }; versions.push(version); return { data: version, pagination: undefined } as never; }
      if (init?.method === 'POST' && path.endsWith('/publish')) { versions[0].publishedAt = '2026-01-01T00:00:00Z'; return { data: versions[0], pagination: undefined } as never; }
      return { data: [...versions], pagination: undefined } as never;
    });
    render(<TemplateDetail token="token" base="/organisations/o/projects/p" template={{ id: 't1', name: 'Parts' }} onBack={() => {}} />);
    await screen.findByText('No versions yet');
    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish version' }));
    expect(vi.mocked(request).mock.calls.some(call => call[1].endsWith('/publish'))).toBe(false);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(vi.mocked(request).mock.calls.some(call => call[1].endsWith('/publish'))).toBe(true));
  });
});
