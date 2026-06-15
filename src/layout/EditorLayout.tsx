import { useRef, useState, type RefObject } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { Toolbar } from '@/panels/Toolbar';
import { Hierarchy } from '@/panels/Hierarchy';
import { Inspector } from '@/panels/Inspector';
import { ScriptEditor } from '@/panels/ScriptEditor';
import { ConsolePanel } from '@/panels/ConsolePanel';
import { SceneViewport } from '@/babylon/SceneViewport';
import { GamePreview } from '@/babylon/GamePreview';
import { useShortcuts } from '@/input/useShortcuts';
import { ShortcutsOverlay } from '@/input/ShortcutsOverlay';
import { Onboarding } from '@/onboarding/Onboarding';
import { HistoryPanel } from '@/ui/HistoryPanel';
import { GoalsEditor } from '@/ui/GoalsEditor';
import { HudEditor } from '@/hud/HudEditor';
import { EffectsEditor } from '@/panels/EffectsEditor';

const Handle = ({ dir }: { dir: 'h' | 'v' }) => <PanelResizeHandle className={`resize-handle ${dir}`} />;

/** Direction the chevron points based on which edge the panel collapses toward. */
const ICONS = {
  left: (c: boolean) => (c ? ChevronRight : ChevronLeft),
  right: (c: boolean) => (c ? ChevronLeft : ChevronRight),
  down: (c: boolean) => (c ? ChevronUp : ChevronDown),
};

/** A resize handle with a collapse/expand toggle for an adjacent panel. */
function CollapseHandle({
  dir,
  edge,
  target,
  collapsed,
}: {
  dir: 'h' | 'v';
  edge: 'left' | 'right' | 'down';
  target: RefObject<ImperativePanelHandle | null>;
  collapsed: boolean;
}) {
  const Icon = ICONS[edge](collapsed);
  return (
    <PanelResizeHandle className={`resize-handle ${dir}`}>
      <button
        className={`collapse-btn ${dir}`}
        title={collapsed ? 'Expand panel' : 'Collapse panel'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          const p = target.current;
          if (!p) return;
          p.isCollapsed() ? p.expand() : p.collapse();
        }}
      >
        <Icon size={12} />
      </button>
    </PanelResizeHandle>
  );
}

export function EditorLayout() {
  useShortcuts();

  const hierarchyRef = useRef<ImperativePanelHandle>(null);
  const previewRef = useRef<ImperativePanelHandle>(null);
  const scriptsRef = useRef<ImperativePanelHandle>(null);
  const consoleRef = useRef<ImperativePanelHandle>(null);
  const inspectorRef = useRef<ImperativePanelHandle>(null);

  const [collapsed, setCollapsed] = useState({
    hierarchy: false,
    preview: false,
    scripts: false,
    console: false,
    inspector: false,
  });
  const flag = (k: keyof typeof collapsed, v: boolean) => setCollapsed((s) => ({ ...s, [k]: v }));

  return (
    <div className="editor-root">
      <Toolbar />
      <ShortcutsOverlay />
      <Onboarding />
      <HistoryPanel />
      <GoalsEditor />
      <HudEditor />
      <EffectsEditor />
      <div className="editor-body">
        {/* Outer horizontal split: Hierarchy | (everything else). Hierarchy is the
            only collapsible panel in this group, so it can't fight the Inspector. */}
        <PanelGroup direction="horizontal" autoSaveId="nf-cols-outer">
          <Panel
            ref={hierarchyRef}
            collapsible
            collapsedSize={0}
            defaultSize={16}
            minSize={11}
            onCollapse={() => flag('hierarchy', true)}
            onExpand={() => flag('hierarchy', false)}
            className={collapsed.hierarchy ? 'col-flush' : 'col'}
          >
            <Hierarchy />
          </Panel>
          <CollapseHandle dir="h" edge="left" target={hierarchyRef} collapsed={collapsed.hierarchy} />

          <Panel minSize={40}>
            {/* Inner horizontal split: center work area | Inspector. Inspector is the
                only collapsible panel in this group. */}
            <PanelGroup direction="horizontal" autoSaveId="nf-main">
          <Panel minSize={30} className="col">
            {/* Outer split: (viewports + scripts) over Console. Only Console is
                collapsible here, so it never fights another collapsible sibling. */}
            <PanelGroup direction="vertical" autoSaveId="nf-center-outer">
              <Panel minSize={28} defaultSize={82}>
                {/* Inner split: viewports over Script editor. Only Scripts is
                    collapsible here — again, no adjacent collapsible sibling. */}
                <PanelGroup direction="vertical" autoSaveId="nf-center-top">
                  <Panel defaultSize={58} minSize={20}>
                    <PanelGroup direction="horizontal" autoSaveId="nf-viewports">
                      <Panel minSize={25}>
                        <SceneViewport />
                      </Panel>
                      <CollapseHandle dir="h" edge="right" target={previewRef} collapsed={collapsed.preview} />
                      <Panel
                        ref={previewRef}
                        collapsible
                        collapsedSize={0}
                        defaultSize={36}
                        minSize={18}
                        onCollapse={() => flag('preview', true)}
                        onExpand={() => flag('preview', false)}
                      >
                        <GamePreview />
                      </Panel>
                    </PanelGroup>
                  </Panel>
                  <CollapseHandle dir="v" edge="down" target={scriptsRef} collapsed={collapsed.scripts} />
                  <Panel
                    ref={scriptsRef}
                    collapsible
                    collapsedSize={0}
                    defaultSize={42}
                    minSize={15}
                    onCollapse={() => flag('scripts', true)}
                    onExpand={() => flag('scripts', false)}
                  >
                    <ScriptEditor />
                  </Panel>
                </PanelGroup>
              </Panel>
              <CollapseHandle dir="v" edge="down" target={consoleRef} collapsed={collapsed.console} />
              <Panel
                ref={consoleRef}
                collapsible
                collapsedSize={0}
                defaultSize={18}
                minSize={8}
                onCollapse={() => flag('console', true)}
                onExpand={() => flag('console', false)}
              >
                <ConsolePanel />
              </Panel>
            </PanelGroup>
          </Panel>
              <CollapseHandle dir="h" edge="right" target={inspectorRef} collapsed={collapsed.inspector} />

              <Panel
                ref={inspectorRef}
                collapsible
                collapsedSize={0}
                defaultSize={20}
                minSize={14}
                onCollapse={() => flag('inspector', true)}
                onExpand={() => flag('inspector', false)}
                className={collapsed.inspector ? 'col-flush' : 'col'}
              >
                <Inspector />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
