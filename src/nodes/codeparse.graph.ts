import type { Edge, Node } from '@xyflow/react';
import type { Expr, Stmt } from './codeparse.ir';
import { NODE_SPECS, defaultFields, type EngineNodeData } from './nodeTypes';

// ---------- graph builder ----------

export class GraphBuilder {
  nodes: Node[] = [];
  edges: Edge[] = [];
  private nid = 0;
  private eid = 0;
  private lowestY = 0;
  private readonly COL = 240;
  private readonly ROW = 160;
  /** The On Collision node, if one was created — source of the `other` reference. */
  collisionNodeId: string | null = null;

  /** Public entry for creating an event node (start/update). */
  event(kind: string, x: number, y: number): Node<EngineNodeData> {
    return this.make(kind, x, y);
  }

  private make(kind: string, x: number, y: number): Node<EngineNodeData> {
    const node: Node<EngineNodeData> = {
      id: `p${this.nid++}`,
      type: 'engineNode',
      position: { x, y },
      data: { kind, fields: defaultFields(kind) },
    };
    this.nodes.push(node);
    this.lowestY = Math.max(this.lowestY, y);
    return node;
  }

  private connect(srcId: string, srcHandle: string, tgtId: string, tgtHandle: string) {
    this.edges.push({
      id: `e${this.eid++}`,
      source: srcId,
      sourceHandle: srcHandle,
      target: tgtId,
      targetHandle: tgtHandle,
      ...(srcHandle.startsWith('exec-') ? { animated: true } : {}),
    });
  }

  /** Feed a data input port: inline literal when possible, else a value node + edge. */
  private feed(node: Node<EngineNodeData>, portId: string, expr: Expr) {
    const spec = NODE_SPECS[node.data.kind];
    const port = spec.inputs.find((p) => p.id === portId);
    const kind = port?.kind;
    if (kind === 'entity') {
      this.feedEntity(node, portId, expr);
      return;
    }
    const lit = literalFor(expr, kind);
    if (lit !== undefined) {
      node.data.fields[portId] = lit;
      return;
    }
    const value = this.buildValue(expr, node.position.x - this.COL, node.position.y);
    this.connect(value.id, 'out-out', node.id, `in-${portId}`);
  }

  /** Wire an entity-reference input from `other` (the collision node) or a named object. */
  private feedEntity(node: Node<EngineNodeData>, portId: string, expr: Expr) {
    if (expr.t === 'collisionOther') {
      if (!this.collisionNodeId) throw new Error('`other` is only available in On Collision');
      this.connect(this.collisionNodeId, 'out-other', node.id, `in-${portId}`);
      return;
    }
    if (expr.t === 'object') {
      const n = this.make('value/object', node.position.x - this.COL, node.position.y);
      n.data.fields.name = expr.name;
      this.connect(n.id, 'out-out', node.id, `in-${portId}`);
      return;
    }
    throw new Error(`cannot represent ${expr.t} as an object reference`);
  }

  private buildValue(expr: Expr, x: number, y: number): Node<EngineNodeData> {
    switch (expr.t) {
      case 'pos':
        return this.make('value/position', x, y);
      case 'time':
        return this.make('value/time', x, y);
      case 'prop': {
        const n = this.make('value/prop', x, y);
        n.data.fields.key = expr.key;
        if (expr.target) this.feedEntity(n, 'target', expr.target);
        return n;
      }
      case 'object': {
        const n = this.make('value/object', x, y);
        n.data.fields.name = expr.name;
        return n;
      }
      case 'key': {
        const n = this.make('value/key', x, y);
        n.data.fields.key = expr.key;
        return n;
      }
      case 'num': {
        const n = this.make('value/number', x, y);
        n.data.fields.value = expr.v;
        return n;
      }
      case 'vec': {
        const n = this.make('value/vec3', x, y);
        n.data.fields.value = vecLiteral(expr) ?? { x: 0, y: 0, z: 0 };
        return n;
      }
      case 'math': {
        const n = this.make('value/math', x, y);
        n.data.fields.op = ['+', '-', '*', '/'].includes(expr.op) ? expr.op : '+';
        this.feed(n, 'a', expr.a);
        this.feed(n, 'b', expr.b);
        return n;
      }
      default:
        throw new Error(`cannot represent ${expr.t} as a value node`);
    }
  }

  /** Build an exec chain; returns nothing — wires from (srcId, srcHandle). */
  buildChain(stmts: Stmt[], srcId: string, srcHandle: string, x: number, y: number) {
    let curId = srcId;
    let curHandle = srcHandle;
    let cx = x;
    for (const st of stmts) {
      const node = this.makeAction(st, cx, y);
      this.connect(curId, curHandle, node.id, 'exec-in');
      if (st.t === 'branch') {
        this.feed(node, 'cond', st.cond);
        const elseY = (this.lowestY += this.ROW);
        this.buildChain(st.thenBody, node.id, 'exec-then', cx + this.COL, y);
        this.buildChain(st.elseBody, node.id, 'exec-else', cx + this.COL, elseY);
        return; // branch terminates the linear flow
      }
      curId = node.id;
      curHandle = 'exec-out';
      cx += this.COL;
    }
  }

  private makeAction(st: Stmt, x: number, y: number): Node<EngineNodeData> {
    switch (st.t) {
      case 'log': {
        const n = this.make('action/log', x, y);
        this.feed(n, 'msg', st.msg);
        return n;
      }
      case 'translate':
      case 'rotate': {
        const n = this.make(`action/${st.t}`, x, y);
        n.data.fields.perSecond = st.perSecond;
        this.feed(n, 'by', st.by);
        return n;
      }
      case 'setPosition': {
        const n = this.make('action/setPosition', x, y);
        this.feed(n, 'to', st.to);
        return n;
      }
      case 'setProp': {
        const n = this.make('action/setProp', x, y);
        n.data.fields.key = st.key;
        if (st.target) this.feedEntity(n, 'target', st.target);
        this.feed(n, 'value', st.value);
        return n;
      }
      case 'branch':
        return this.make('action/branch', x, y);
    }
  }
}

function vecLiteral(expr: Expr): { x: number; y: number; z: number } | undefined {
  if (expr.t !== 'vec') return undefined;
  if (expr.x.t === 'num' && expr.y.t === 'num' && expr.z.t === 'num') {
    return { x: expr.x.v, y: expr.y.v, z: expr.z.v };
  }
  return undefined;
}

/** A literal value for an inline field, or undefined if the expr needs a node + edge. */
function literalFor(expr: Expr, kind: string | undefined): number | string | boolean | { x: number; y: number; z: number } | undefined {
  if (kind === 'number' && expr.t === 'num') return expr.v;
  if (kind === 'string' && expr.t === 'str') return expr.v;
  if (kind === 'bool' && expr.t === 'bool') return expr.v;
  if (kind === 'vec3') return vecLiteral(expr);
  return undefined;
}
