import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('scrubs the value when the field is dragged', () => {
    const onChange = vi.fn();
    render(<NumberInput value={0} onChange={onChange} step={0.1} />);
    const input = screen.getByRole('textbox');
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    // 50px to the right at step 0.1 => +5
    fireEvent.pointerMove(input, { pointerId: 1, clientX: 150, clientY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(5);
    // dragging back down-left past the start decreases it (anchored to the base)
    fireEvent.pointerMove(input, { pointerId: 1, clientX: 100, clientY: 110 });
    expect(onChange).toHaveBeenLastCalledWith(-1);
    fireEvent.pointerUp(input, { pointerId: 1, clientX: 100, clientY: 110 });
  });

  it('treats a press without movement as a click, not a scrub', () => {
    const onChange = vi.fn();
    render(<NumberInput value={2} onChange={onChange} step={0.1} />);
    const input = screen.getByRole('textbox');
    fireEvent.pointerDown(input, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(input, { pointerId: 1, clientX: 101, clientY: 100 }); // under threshold
    fireEvent.pointerUp(input, { pointerId: 1, clientX: 101, clientY: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
