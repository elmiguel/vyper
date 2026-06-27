import { useEditorStore } from '@/store/editorStore';
import { Check, Slider, Color } from './controls';

/**
 * Editor Settings — appearance/UX preferences. Saved per-project in the game's
 * settings blob (DB) and mirrored to localStorage as the cross-project default.
 * Organized into categories; add new ones as further <section> blocks backed by
 * their own prefs keys. Selection controls the HighlightLayer around the picked
 * object; Grid controls the editor work-plane grid.
 */
export function EditorSettings() {
  const selection = useEditorStore((s) => s.editorPrefs.selection);
  const grid = useEditorStore((s) => s.editorPrefs.grid);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const updateSelection = useEditorStore((s) => s.updateSelectionPrefs);
  const updateGrid = useEditorStore((s) => s.updateGridPrefs);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const reset = useEditorStore((s) => s.resetEditorPrefs);

  return (
    <div className="panel-scroll editor-settings">
      <section>
        <h4>Selection &amp; Highlight</h4>
        <Check
          label="Fill selected object (inner glow)"
          checked={selection.innerGlow}
          onChange={(v) => updateSelection({ innerGlow: v })}
        />
        <Color label="Selection color" value={selection.outlineColor} onChange={(v) => updateSelection({ outlineColor: v })} />
        <Slider label="Overlay opacity" value={selection.opacity} min={0} max={1} step={0.05} onChange={(v) => updateSelection({ opacity: v })} />
        <Color label="Camera helper color" value={selection.cameraColor} onChange={(v) => updateSelection({ cameraColor: v })} />
        <Slider label="Glow softness" value={selection.glow} min={0} max={4} step={0.25} onChange={(v) => updateSelection({ glow: v })} />
        <div className="empty-hint inline">
          Inner glow off gives a clean outline; on floods the object with the selection color.
        </div>
      </section>

      <section>
        <h4>Grid</h4>
        <Check label="Show grid" checked={gridVisible} onChange={() => toggleGrid()} />
        <Slider label="Cell size (units)" value={grid.cellSize} min={0.25} max={10} step={0.25} onChange={(v) => updateGrid({ cellSize: v })} />
        <Slider label="Extent (± units)" value={grid.extent} min={5} max={100} step={5} onChange={(v) => updateGrid({ extent: v })} />
        <Color label="Grid color" value={grid.color} onChange={(v) => updateGrid({ color: v })} />
        <Slider label="Grid opacity" value={grid.opacity} min={0} max={1} step={0.05} onChange={(v) => updateGrid({ opacity: v })} />
      </section>

      <button type="button" className="ghost-btn" onClick={reset}>
        Reset to defaults
      </button>
    </div>
  );
}
