import { useState } from 'react';
import { X, History, RotateCcw, Loader2, Save, Camera } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';

function when(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago · ${d.toLocaleTimeString()}`;
  return d.toLocaleString();
}

export function HistoryPanel() {
  const {
    showHistory, versions, versionsLoading, autosaveEnabled, saving,
    setShowHistory, restoreVersion, setAutosave, save, loadVersions,
  } = useProjectStore();
  const [confirm, setConfirm] = useState<string | null>(null);

  if (!showHistory) return null;

  const checkpoint = async () => {
    await save({ snapshot: 'manual', label: 'Checkpoint' });
    void loadVersions();
  };

  return (
    <div className="sc-backdrop" onClick={() => setShowHistory(false)}>
      <div className="sc-modal hist-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Version history">
        <header className="sc-head">
          <div className="sc-title">
            <History size={17} />
            <span>Version History</span>
          </div>
          <label className="hist-auto" title="Autosave periodically writes a restorable snapshot">
            <input type="checkbox" checked={autosaveEnabled} onChange={(e) => setAutosave(e.target.checked)} />
            Autosave
          </label>
          <button className="hist-checkpoint" onClick={() => void checkpoint()} disabled={saving}>
            {saving ? <Loader2 size={13} className="spin" /> : <Camera size={13} />} Save checkpoint
          </button>
          <button className="sc-close" onClick={() => setShowHistory(false)} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="hist-body">
          {versionsLoading && <div className="empty-hint"><Loader2 size={14} className="spin" /> Loading…</div>}
          {!versionsLoading && versions.length === 0 && (
            <div className="empty-hint">No saved versions yet. Edits autosave a snapshot every couple of minutes; use “Save checkpoint” to capture one now.</div>
          )}
          {versions.map((v) => (
            <div className="hist-row" key={v.id}>
              <span className={`hist-kind ${v.kind}`}>{v.kind === 'manual' ? <Save size={11} /> : <Camera size={11} />}</span>
              <div className="hist-meta">
                <span className="hist-label">{v.label || (v.kind === 'manual' ? 'Manual save' : 'Autosave')}</span>
                <span className="hist-time">{when(v.createdAt)}</span>
              </div>
              {confirm === v.id ? (
                <span className="hist-confirm">
                  <button className="hist-restore go" onClick={() => void restoreVersion(v.id)}>Confirm restore</button>
                  <button className="hist-cancel" onClick={() => setConfirm(null)}>Cancel</button>
                </span>
              ) : (
                <button className="hist-restore" onClick={() => setConfirm(v.id)}>
                  <RotateCcw size={12} /> Restore
                </button>
              )}
            </div>
          ))}
        </div>

        <footer className="sc-foot">
          Restoring loads a snapshot into the editor and saves it as a new checkpoint — your other versions are kept, so you can always go back again.
        </footer>
      </div>
    </div>
  );
}
