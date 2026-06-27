import type { IDockviewPanelProps } from 'dockview';
import { Hierarchy } from '@/panels/Hierarchy';
import { Inspector } from '@/panels/Inspector';
import { ScriptEditor } from '@/panels/ScriptEditor';
import { ConsolePanel } from '@/panels/ConsolePanel';
import { ModelingTools } from '@/panels/ModelingTools';
import { GameStylePanel } from '@/panels/GameStylePanel';
import { EditorSettings } from '@/panels/EditorSettings';
import { SceneViewport } from '@/babylon/SceneViewport';
import { GamePreview } from '@/babylon/GamePreview';

/** Stable identifiers for the dockable panels — used as both panel id and component key. */
export type PanelKey = 'scene' | 'preview' | 'hierarchy' | 'inspector' | 'modeling' | 'gameStyle' | 'scripts' | 'console' | 'editorSettings';

/** Title + content component for each dockable panel. The title shows in the dock tab. */
export const PANELS: Record<PanelKey, { title: string; Component: () => JSX.Element }> = {
  scene: { title: 'Scene', Component: SceneViewport },
  preview: { title: 'Game', Component: GamePreview },
  hierarchy: { title: 'Hierarchy', Component: Hierarchy },
  inspector: { title: 'Inspector', Component: Inspector },
  modeling: { title: 'Modeling', Component: ModelingTools },
  gameStyle: { title: 'Game Style', Component: GameStylePanel },
  scripts: { title: 'Scripts', Component: ScriptEditor },
  console: { title: 'Debugger', Component: ConsolePanel },
  editorSettings: { title: 'Settings', Component: EditorSettings },
};

export const PANEL_KEYS = Object.keys(PANELS) as PanelKey[];

/** Wrap a panel component in a full-height container dockview can size. */
function wrap(Component: () => JSX.Element) {
  return function DockPanel(_props: IDockviewPanelProps) {
    return (
      <div className="dock-panel">
        <Component />
      </div>
    );
  };
}

/** Component map passed to <DockviewReact components={...} />. Keys match PanelKey. */
export const dockComponents: Record<string, React.FunctionComponent<IDockviewPanelProps>> =
  Object.fromEntries(PANEL_KEYS.map((k) => [k, wrap(PANELS[k].Component)]));
