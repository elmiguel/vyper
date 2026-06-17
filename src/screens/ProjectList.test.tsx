import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSummary } from '@/data';

const mock = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: () => mock.state,
}));

import { ProjectList } from './ProjectList';

function game(id: string, kind: '2d' | '3d' | 'model'): GameSummary {
  return {
    id, owner: 'me', name: id, description: '', activeSceneId: null,
    settings: { kind }, createdAt: '', updatedAt: new Date().toISOString(), sceneCount: 1,
  };
}

let openGame: ReturnType<typeof vi.fn>;
let deleteGame: ReturnType<typeof vi.fn>;
let setGameCover: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openGame = vi.fn();
  deleteGame = vi.fn();
  setGameCover = vi.fn();
  mock.state = {
    games: [game('Alpha', '3d'), game('Beta', '2d'), game('Gamma', 'model')],
    gamesLoading: false,
    openGame, deleteGame, setGameCover,
  };
});

describe('ProjectList', () => {
  it('lists all projects by default', () => {
    render(<ProjectList />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('filters to a single chip and unions additional chips', async () => {
    render(<ProjectList />);
    await userEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();

    // Adding "Models" unions models back in alongside the 2D game.
    await userEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('opens the options menu with an upload action', async () => {
    render(<ProjectList />);
    await userEvent.click(screen.getByLabelText('Options for Alpha'));
    expect(screen.getByText('Upload image…')).toBeInTheDocument();
    expect(screen.getByText('Delete game')).toBeInTheDocument();
  });

  it('confirms before deleting', async () => {
    render(<ProjectList />);
    await userEvent.click(screen.getByLabelText('Options for Alpha'));
    await userEvent.click(screen.getByText('Delete game'));
    expect(deleteGame).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteGame).toHaveBeenCalledWith('Alpha');
  });
});
