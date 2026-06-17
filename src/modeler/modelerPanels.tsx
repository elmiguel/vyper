import type { DockviewApi, IDockviewPanelProps } from 'dockview';
import { ModelerViewport } from './ModelerViewport';
import { ModelerTools } from './ModelerTools';

/** Dockable panels in the 3D Modeling area — purpose-built for modeling + rendering,
 *  with no game-editor panels (no Scripts/Game/Debugger/scene gizmos). */
export type ModelerPanelKey = 'viewport' | 'tools';

export const MODELER_PANELS: Record<ModelerPanelKey, { title: string; Component: () => JSX.Element }> = {
  viewport: { title: 'Viewport', Component: ModelerViewport },
  tools: { title: 'Modeling', Component: ModelerTools },
};

const KEYS = Object.keys(MODELER_PANELS) as ModelerPanelKey[];

function wrap(Component: () => JSX.Element) {
  return function DockPanel(_props: IDockviewPanelProps) {
    return (
      <div className="dock-panel">
        <Component />
      </div>
    );
  };
}

export const modelerDockComponents: Record<string, React.FunctionComponent<IDockviewPanelProps>> =
  Object.fromEntries(KEYS.map((k) => [k, wrap(MODELER_PANELS[k].Component)]));

/** Default Modeling-area arrangement: tools left, big editing viewport center. */
export function buildModelerLayout(api: DockviewApi) {
  api.clear();
  api.addPanel({ id: 'viewport', component: 'viewport', title: MODELER_PANELS.viewport.title });
  api.addPanel({ id: 'tools', component: 'tools', title: MODELER_PANELS.tools.title, position: { referencePanel: 'viewport', direction: 'left' }, initialWidth: 240 });
}
