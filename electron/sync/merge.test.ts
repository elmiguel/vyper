import { describe, expect, it } from 'vitest';
import { mergeByTimestamp, unionById } from './merge';

const t = (s: string) => new Date(s);

describe('mergeByTimestamp (newest-updatedAt wins)', () => {
  it('pushes the newer side to the stale side, both directions', () => {
    const local = [
      { id: 'a', updatedAt: t('2026-01-02') }, // newer locally
      { id: 'b', updatedAt: t('2026-01-01') }, // older locally
    ];
    const remote = [
      { id: 'a', updatedAt: t('2026-01-01') },
      { id: 'b', updatedAt: t('2026-01-03') }, // newer remotely
    ];
    const { toLocal, toRemote } = mergeByTimestamp(local, remote);
    expect(toRemote.map((r) => r.id)).toEqual(['a']); // local 'a' wins → to remote
    expect(toLocal.map((r) => r.id)).toEqual(['b']); // remote 'b' wins → to local
  });

  it('copies one-sided rows to the other side', () => {
    const local = [{ id: 'only-local', updatedAt: t('2026-01-01') }];
    const remote = [{ id: 'only-remote', updatedAt: t('2026-01-01') }];
    const { toLocal, toRemote } = mergeByTimestamp(local, remote);
    expect(toRemote.map((r) => r.id)).toEqual(['only-local']);
    expect(toLocal.map((r) => r.id)).toEqual(['only-remote']);
  });

  it('does nothing when timestamps are equal (already in sync)', () => {
    const row = { id: 'a', updatedAt: t('2026-01-01') };
    const { toLocal, toRemote } = mergeByTimestamp([{ ...row }], [{ ...row }]);
    expect(toLocal).toEqual([]);
    expect(toRemote).toEqual([]);
  });

  it('accepts ISO-string and epoch timestamps', () => {
    const { toRemote } = mergeByTimestamp(
      [{ id: 'a', updatedAt: '2026-05-01T00:00:00Z' }],
      [{ id: 'a', updatedAt: '2026-01-01T00:00:00Z' }],
    );
    expect(toRemote.map((r) => r.id)).toEqual(['a']);
  });
});

describe('unionById (append-only)', () => {
  it('copies only the rows missing on each side', () => {
    const local = [{ id: '1' }, { id: '2' }];
    const remote = [{ id: '2' }, { id: '3' }];
    const { toLocal, toRemote } = unionById(local, remote);
    expect(toRemote.map((r) => r.id)).toEqual(['1']); // remote lacks 1
    expect(toLocal.map((r) => r.id)).toEqual(['3']); // local lacks 3
  });
});
