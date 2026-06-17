import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import type { Entity } from '@/types';
import { RiggingPanel } from './RiggingPanel';

const box = (id: string): Entity =>
  ({
    id, name: 'Box', parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#fff', visible: true },
    scriptIds: [], props: {},
  } as Entity);

const restRig = () => ({ active: false, entityId: null, selectedBone: null, activeClipId: null, playhead: 0, playing: false, scrubPose: null });

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [], selectedId: null, rig: restRig() });
});

describe('RiggingPanel', () => {
  it('disables Rig Mode with nothing selected', () => {
    render(<RiggingPanel />);
    expect(screen.getByRole('button', { name: /Enter Rig Mode/i })).toBeDisabled();
  });

  it('notes 3D-only in 2D mode', () => {
    useEditorStore.setState({ mode: '2d' });
    render(<RiggingPanel />);
    expect(screen.getByText(/available in 3D mode/i)).toBeInTheDocument();
  });

  it('shows armature + animation tools while rigging a selected mesh', () => {
    useEditorStore.setState({ entities: [box('a')], selectedId: 'a', rig: { ...restRig(), active: true, entityId: 'a' } });
    render(<RiggingPanel />);
    expect(screen.getByRole('button', { name: /Exit Rig Mode/i })).toBeInTheDocument();
    expect(screen.getByText('Add Bone')).toBeInTheDocument();
    expect(screen.getByText('Auto Weight')).toBeInTheDocument();
    expect(screen.getByText('New Clip')).toBeInTheDocument();
  });
});
