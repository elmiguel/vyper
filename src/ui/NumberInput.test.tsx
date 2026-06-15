import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('renders the committed value via the display function', () => {
    render(<NumberInput value={3.5} onChange={() => {}} display={(v) => v.toFixed(1)} />);
    expect(screen.getByRole('textbox')).toHaveValue('3.5');
  });

  it('commits a parsed finite number on change', async () => {
    const onChange = vi.fn();
    render(<NumberInput value={0} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), '42');
    expect(onChange).toHaveBeenLastCalledWith(42);
  });

  it('lets you type intermediate strings without coercing to a number', async () => {
    const onChange = vi.fn();
    render(<NumberInput value={0} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    onChange.mockClear();
    // A lone "-" is not a finite number, so it must not be committed...
    await userEvent.type(input, '-');
    expect(onChange).not.toHaveBeenCalled();
    // ...but the draft keeps the character visible so a negative can be typed.
    expect(input).toHaveValue('-');
  });

  it('re-syncs to the canonical value on blur', async () => {
    render(<NumberInput value={7} onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '9');
    await userEvent.tab(); // blur drops the draft
    expect(input).toHaveValue('7');
  });
});
