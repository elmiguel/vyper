import { describe, it, expect } from 'vitest';
import { NODE_PALETTE, NODE_SPECS, filterNodePalette } from './nodeTypes';

describe('filterNodePalette', () => {
  it('returns the full palette for an empty or whitespace query', () => {
    expect(filterNodePalette(NODE_PALETTE, '')).toBe(NODE_PALETTE);
    expect(filterNodePalette(NODE_PALETTE, '   ')).toBe(NODE_PALETTE);
  });

  it('matches on a node label, keeping its category header', () => {
    const result = filterNodePalette(NODE_PALETTE, 'trigger');
    expect(result.length).toBeGreaterThan(0);
    // Every surviving group keeps at least one item.
    expect(result.every((g) => g.items.length > 0)).toBe(true);
    // The trigger category survives with its onEnter/onExit/onStay items.
    const trig = result.find((g) => g.category === 'trigger');
    expect(trig?.items).toContain('trigger/onEnter');
  });

  it('matches on the kind id as well as the label', () => {
    const result = filterNodePalette(NODE_PALETTE, 'event/keyDown');
    const event = result.find((g) => g.category === 'event');
    expect(event?.items).toEqual(['event/keyDown']);
  });

  it('drops categories with no matches', () => {
    // "log" should match only the action/log node, dropping all other categories.
    const result = filterNodePalette(NODE_PALETTE, 'log');
    expect(result.every((g) => g.items.every((k) => NODE_SPECS[k].label.toLowerCase().includes('log') || k.toLowerCase().includes('log')))).toBe(true);
    expect(result.some((g) => g.items.includes('action/log'))).toBe(true);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterNodePalette(NODE_PALETTE, 'zzzznotanode')).toEqual([]);
  });

  it('includes the Respawn action node', () => {
    const result = filterNodePalette(NODE_PALETTE, 'respawn');
    expect(result.some((g) => g.items.includes('action/respawn'))).toBe(true);
  });

  it('is case-insensitive', () => {
    const lower = filterNodePalette(NODE_PALETTE, 'start');
    const upper = filterNodePalette(NODE_PALETTE, 'START');
    expect(upper).toEqual(lower);
  });
});
