import type { EditableMesh, ComponentMode } from './EditableMesh';
import {
  extrudeFaces, insetFaces, subdivideFaces, bevelEdges, loopCut,
  connectVertices, bridgeEdgeLoops, splitEdgeLoops,
} from './meshOps';
import { selectedVertexIndices } from './MeshEditOverlay';

/** A modeling operator the UI can invoke against the current selection. */
export type MeshEditOp =
  | 'extrude' | 'inset' | 'subdivide' | 'bevel' | 'loopcut' | 'delete' | 'merge' | 'triangulate'
  | 'connect' | 'bridge';

/**
 * Run a modeling operator in place against `edit` for the current `component` + `selection`
 * (mutating both the mesh and, where the op clears/keeps a selection, the `selection` set).
 * Returns face ids the caller should re-select (extrude), or null. Pure dispatch extracted
 * from MeshEditController so the controller only handles preview/gizmo/commit bookkeeping.
 */
export function runMeshOp(
  edit: EditableMesh,
  op: MeshEditOp,
  component: ComponentMode,
  selection: Set<string>,
  amount: number,
): number[] | null {
  const faces = component === 'face' ? [...selection].map(Number) : [];
  switch (op) {
    case 'extrude':
      return extrudeFaces(edit, faces, amount || 0.5).faces;
    case 'inset':
      insetFaces(edit, faces, amount || 0.25);
      return null;
    case 'subdivide':
      subdivideFaces(edit, faces.length ? faces : edit.faces.map((_, i) => i));
      return null;
    case 'bevel':
      if (component === 'edge') bevelEdges(edit, [...selection], amount || 0.1);
      return null;
    case 'loopcut':
      if (component === 'edge' && selection.size) loopCut(edit, [...selection][0]);
      return null;
    case 'delete':
      if (component === 'face') edit.deleteFaces(faces);
      selection.clear();
      return null;
    case 'merge':
      if (selection.size > 1) {
        edit.mergeVertices(selectedVertexIndices(edit, component, selection));
        selection.clear();
      }
      return null;
    case 'triangulate':
      // Triangulate the selected faces, or the whole mesh when nothing is selected.
      edit.triangulateFaces(faces.length ? faces : undefined);
      selection.clear();
      return null;
    case 'connect':
      // Connect the selected vertices (or an edge selection's endpoints) with new edges.
      connectVertices(edit, selectedVertexIndices(edit, component, selection));
      selection.clear();
      return null;
    case 'bridge':
      // Bridge two selected edge loops; the edge selection must form exactly two loops.
      if (component === 'edge' && selection.size >= 2) {
        const groups = splitEdgeLoops([...selection]);
        if (groups.length === 2) bridgeEdgeLoops(edit, groups[0], groups[1]);
      }
      selection.clear();
      return null;
  }
  return null;
}
