import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { EditableMesh, EditVertex } from './editmesh/EditableMesh';
import { applyKnife, nearestFaceEdge, type KnifePoint } from './editmesh/knife';
import type { MeshToolHost } from './MeshToolHost';

const CUT_COLOR = new Color4(1, 0.3, 0.3, 1);

/**
 * Interactive knife tool. Left-clicks drop points, each snapped to the nearest edge of
 * the face under the cursor; a rubber-band guide previews the path; right-click (or a
 * second click on the last point) commits, splitting every face the path crosses via the
 * pure {@link applyKnife}. Escape/leaving the tool discards the in-progress path.
 */
export class MeshKnifeSession {
  private points: KnifePoint[] = [];
  private hover?: EditVertex;
  private guide?: LinesMesh;

  constructor(private readonly host: MeshToolHost) {}

  route(info: PointerInfo): boolean {
    const e = info.event as PointerEvent;
    if (info.type === 1 /* DOWN */) {
      if (e.button === 2) this.commitCut();
      else if (e.button === 0) this.addPoint();
    } else if (info.type === 4 /* MOVE */) {
      this.updateHover();
    }
    return true;
  }

  /** Discard the in-progress path (leaving the tool / Edit Mode). */
  reset(): void {
    this.points = [];
    this.hover = undefined;
    this.guide?.dispose();
    this.guide = undefined;
  }

  private snap(): { point: KnifePoint; pos: EditVertex } | null {
    const edit = this.host.getEdit();
    const pick = this.host.pickFace();
    if (!edit || !pick) return null;
    const hit = nearestFaceEdge(edit, pick.faceId, { x: pick.local.x, y: pick.local.y, z: pick.local.z });
    if (!hit) return null;
    return { point: { a: hit.a, b: hit.b, t: hit.t }, pos: hit.point };
  }

  private addPoint(): void {
    const s = this.snap();
    if (!s) return;
    this.points.push(s.point);
    this.hover = s.pos;
    this.redraw();
  }

  private updateHover(): void {
    const s = this.snap();
    this.hover = s?.pos;
    this.redraw();
  }

  private commitCut(): void {
    const edit = this.host.getEdit();
    if (edit && this.points.length >= 2) {
      applyKnife(edit, this.points);
      this.host.rebuildPreview();
      this.host.commit();
    }
    this.reset();
  }

  private redraw(): void {
    this.guide?.dispose();
    this.guide = undefined;
    const edit = this.host.getEdit();
    const root = this.host.getRoot();
    if (!edit || !root) return;
    const pts: Vector3[] = this.points.map((p) => {
      const a = edit.vertices[p.a];
      const b = edit.vertices[p.b];
      return new Vector3(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t, a.z + (b.z - a.z) * p.t);
    });
    if (this.hover) pts.push(new Vector3(this.hover.x, this.hover.y, this.hover.z));
    if (pts.length < 2) return;
    const m = CreateLineSystem('meshedit-knifeguide', { lines: [pts], colors: [pts.map(() => CUT_COLOR)] }, this.host.scene);
    m.parent = root;
    m.isPickable = false;
    m.renderingGroupId = 1;
    this.guide = m;
  }
}
