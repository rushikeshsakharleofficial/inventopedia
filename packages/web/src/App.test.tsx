import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('shows sign-in and explains missing configuration', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Good to see you.' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Sign-in is not configured');
    expect((screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows password visibility to be toggled', () => {
    render(<App />);
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
  });
});

