import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mock = vi.hoisted(() => ({ toDataUrl: vi.fn() }));
vi.mock('./coverImage', () => ({ fileToCoverDataUrl: mock.toDataUrl }));

import { CoverUploadModal } from './CoverUploadModal';

beforeEach(() => mock.toDataUrl.mockReset());

describe('CoverUploadModal', () => {
  it('renders the project name and drop affordance', () => {
    render(<CoverUploadModal projectName="My Game" onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/My Game/)).toBeInTheDocument();
    expect(screen.getByText(/Drop an image here/)).toBeInTheDocument();
  });

  it('processes a dropped image into a data URL and hands it to onPick', async () => {
    mock.toDataUrl.mockResolvedValue('data:image/jpeg;base64,zzz');
    const onPick = vi.fn();
    render(<CoverUploadModal projectName="X" onPick={onPick} onClose={() => {}} />);
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(mock.toDataUrl).toHaveBeenCalledWith(file);
    expect(onPick).toHaveBeenCalledWith('data:image/jpeg;base64,zzz');
  });

  it('rejects non-image files with an error', async () => {
    const onPick = vi.fn();
    render(<CoverUploadModal projectName="X" onPick={onPick} onClose={() => {}} />);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    // applyAccept:false so the non-image reaches our guard instead of being filtered by accept="image/*"
    await userEvent.upload(input, file, { applyAccept: false });
    expect(mock.toDataUrl).not.toHaveBeenCalled();
    expect(screen.getByText(/choose an image file/i)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });
});
