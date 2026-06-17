import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSummary } from '@/data';
import { ProjectCard, timeAgo } from './ProjectCard';

function game(over: Partial<GameSummary> = {}): GameSummary {
  return {
    id: 'g1', owner: 'me', name: 'My Game', description: '', activeSceneId: null,
    settings: { kind: '3d' }, createdAt: '', updatedAt: new Date().toISOString(), sceneCount: 2, ...over,
  };
}

describe('timeAgo', () => {
  it('formats recent timestamps', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    expect(timeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3h ago');
  });
});

describe('ProjectCard', () => {
  it('shows name, kind badge, and scene count', () => {
    render(<ProjectCard game={game()} onOpen={() => {}} onMenu={() => {}} />);
    expect(screen.getByText('My Game')).toBeInTheDocument();
    expect(screen.getByText('3D')).toBeInTheDocument();
    expect(screen.getByText('2 scenes')).toBeInTheDocument();
  });

  it('labels models as MODEL', () => {
    render(<ProjectCard game={game({ settings: { kind: 'model' } })} onOpen={() => {}} onMenu={() => {}} />);
    expect(screen.getByText('MODEL')).toBeInTheDocument();
  });

  it('opens on row click but the menu button does not open', async () => {
    const onOpen = vi.fn();
    const onMenu = vi.fn();
    render(<ProjectCard game={game()} onOpen={onOpen} onMenu={onMenu} />);
    await userEvent.click(screen.getByText('My Game'));
    expect(onOpen).toHaveBeenCalledWith('g1');

    onOpen.mockClear();
    await userEvent.click(screen.getByLabelText('Options for My Game'));
    expect(onMenu).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
