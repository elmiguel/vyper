import type { Edge, Node } from '@xyflow/react';
import type { ScriptGraph } from '@/types';
import { type EngineNodeData } from './nodeTypes';
import type { DataKind } from './nodeSpec.types';
import { portKind } from './connectionRules';
import { branchCondition, effectiveKind, opNeedsRhs, type BranchPath } from './branchLogic';
import { ASSET_TEMPLATES } from './assetTemplates';

/**
 * Compiles a node graph into runnable JS source that defines `onStart(dt)` and
 * `onUpdate(dt)`. This is the node → script half of the round-trip: the generated
 * code is what the runtime executes and what the user sees in the code editor.
 */

function lit(v: unknown): string {
  if (v && typeof v === 'object' && 'x' in (v as object)) {
    const o = v as { x: number; y: number; z: number };
    return `vec(${num(o.x)}, ${num(o.y)}, ${num(o.z)})`;
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return num(v as number);
}

function num(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '0';
}

class Compiler {
  private byId = new Map<string, Node<EngineNodeData>>();
  private dataIn = new Map<string, Edge>(); // key: `${target}|${handle}`
  private execOut = new Map<string, Edge[]>(); // key: `${source}|${handle}` → fan-out targets

  constructor(graph: ScriptGraph, private trace = false) {
    for (const n of graph.nodes) this.byId.set(n.id, n as Node<EngineNodeData>);
    for (const e of graph.edges) {
      if (e.targetHandle?.startsWith('in-')) {
        this.dataIn.set(`${e.target}|${e.targetHandle.slice(3)}`, e);
      } else if (e.sourceHandle?.startsWith('exec-')) {
        const key = `${e.source}|${e.sourceHandle.slice(5)}`;
        (this.execOut.get(key) ?? this.execOut.set(key, []).get(key)!).push(e);
      }
    }
  }

  /** Expression for a node's data output handle. */
  private outputExpr(nodeId: string): string {
    const node = this.byId.get(nodeId);
    if (!node) return '0';
    const f = node.data.fields ?? {};
    switch (node.data.kind) {
      case 'value/number':
        return num(f.value);
      case 'value/vec3':
        return lit(f.value ?? { x: 0, y: 0, z: 0 });
      case 'value/position':
        return 'entity.position';
      case 'value/prop': {
        const key = JSON.stringify(String(f.key ?? ''));
        const target = this.entityExpr(nodeId, 'target');
        return target ? `world.getProp(${target}, ${key})` : `(entity.props[${key}] ?? 0)`;
      }
      case 'value/object':
        return `world.findObject(${JSON.stringify(String(f.name ?? ''))})`;
      case 'physics/onCollision':
      case 'trigger/onEnter':
      case 'trigger/onExit':
      case 'trigger/onStay':
        return 'other';
      case 'value/time':
        return 'time.elapsed';
      case 'value/key':
        return `input.key(${JSON.stringify(String(f.key ?? ''))})`;
      case 'event/update':
        return 'dt';
      case 'value/math': {
        const a = this.inputExpr(nodeId, 'a');
        const b = this.inputExpr(nodeId, 'b');
        const op = String(f.op ?? '+');
        if (op === '/') return `(${b} !== 0 ? ${a} / ${b} : 0)`;
        return `(${a} ${['+', '-', '*'].includes(op) ? op : '+'} ${b})`;
      }
      case 'physics/getVelocity':
        return 'entity.getVelocity()';
      case 'physics/isGrounded':
        return 'entity.isGrounded()';
      case 'physics/raycast':
        return `entity.raycastHit(${lit(f.dir ?? { x: 0, y: -1, z: 0 })}, ${num(f.length ?? 1)})`;
      case 'objective/isComplete':
        return `world.isComplete(${JSON.stringify(String(f.goal ?? ''))})`;
      case 'objective/progress':
        return `world.progress(${JSON.stringify(String(f.goal ?? ''))})`;
      default:
        return '0';
    }
  }

  /** Expression for a node's data input: connected source, else literal default. */
  private inputExpr(nodeId: string, inputId: string): string {
    const edge = this.dataIn.get(`${nodeId}|${inputId}`);
    if (edge) return this.outputExpr(edge.source);
    const node = this.byId.get(nodeId);
    return lit(node?.data.fields?.[inputId]);
  }

  /** Entity-reference input: the connected object expression, or null when unconnected (= self). */
  private entityExpr(nodeId: string, inputId: string): string | null {
    const edge = this.dataIn.get(`${nodeId}|${inputId}`);
    return edge ? this.outputExpr(edge.source) : null;
  }

  /** Data kind feeding an input (from the connected source's output port), or null if unconnected. */
  private sourceKind(nodeId: string, inputId: string): DataKind | null {
    const edge = this.dataIn.get(`${nodeId}|${inputId}`);
    if (!edge?.sourceHandle) return null;
    return portKind(this.byId.get(edge.source), edge.sourceHandle, 'out') as DataKind | null;
  }

  /**
   * Statements for the execution chain(s) reached from a given exec output.
   * A single output may fan out to several targets; they run in top-to-bottom
   * canvas order, each on its own copy of `seen` so a node shared by two
   * branches still emits in both.
   */
  private execChain(fromNode: string, handle: string, indent: string, seen: Set<string>): string {
    const edges = this.execOut.get(`${fromNode}|${handle}`);
    if (!edges || edges.length === 0) return '';
    const ordered =
      edges.length === 1
        ? edges
        : [...edges].sort((a, b) => {
            const pa = this.byId.get(a.target)?.position ?? { x: 0, y: 0 };
            const pb = this.byId.get(b.target)?.position ?? { x: 0, y: 0 };
            return pa.y - pb.y || pa.x - pb.x;
          });
    let out = '';
    for (const edge of ordered) {
      out += this.emit(edge.target, indent, edges.length === 1 ? seen : new Set(seen));
    }
    return out;
  }

  private emit(nodeId: string, indent: string, seen: Set<string>): string {
    if (seen.has(nodeId)) return `${indent}// (cycle skipped)\n`;
    seen.add(nodeId);
    const node = this.byId.get(nodeId);
    if (!node) return '';
    const f = node.data.fields ?? {};
    let out = '';

    // Live-flow instrumentation: ping the tracker as this node executes. Only
    // emitted for the runtime build — the code shown in the editor stays clean.
    if (this.trace) out += `${indent}__node(${JSON.stringify(nodeId)});\n`;

    switch (node.data.kind) {
      case 'action/log':
        out += `${indent}console.log(${this.inputExpr(nodeId, 'msg')});\n`;
        break;
      case 'action/translate': {
        const v = this.inputExpr(nodeId, 'by');
        const per = f.perSecond ? ' * dt' : '';
        out += `${indent}{ const _v = ${v}; entity.translate(_v.x${per}, _v.y${per}, _v.z${per}); }\n`;
        break;
      }
      case 'action/rotate': {
        const v = this.inputExpr(nodeId, 'by');
        const per = f.perSecond ? ' * dt' : '';
        out += `${indent}{ const _v = ${v}; entity.rotate(_v.x${per}, _v.y${per}, _v.z${per}); }\n`;
        break;
      }
      case 'action/setPosition':
        out += `${indent}entity.setPosition(${this.inputExpr(nodeId, 'to')});\n`;
        break;
      case 'action/respawn':
        out += `${indent}entity.respawn();\n`;
        break;
      case 'action/setProp': {
        const key = JSON.stringify(String(f.key ?? ''));
        const value = this.inputExpr(nodeId, 'value');
        const target = this.entityExpr(nodeId, 'target');
        out += target
          ? `${indent}world.setProp(${target}, ${key}, ${value});\n`
          : `${indent}entity.props[${key}] = ${value};\n`;
        break;
      }
      case 'physics/setVelocity': {
        const v = this.inputExpr(nodeId, 'v');
        out += `${indent}{ const _v = ${v}; entity.setVelocity(_v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'physics/applyImpulse': {
        const v = this.inputExpr(nodeId, 'v');
        out += `${indent}{ const _v = ${v}; entity.applyImpulse(_v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'physics/applyForce': {
        const v = this.inputExpr(nodeId, 'v');
        out += `${indent}{ const _v = ${v}; entity.applyForce(_v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'fx/playEffect': {
        const name = String(f.name ?? '');
        out += `${indent}entity.playEffect(${name ? JSON.stringify(name) : ''});\n`;
        break;
      }
      case 'fx/stopEffect':
        out += `${indent}entity.stopEffect();\n`;
        break;
      case 'world/playClip': {
        const clip = String(f.clip ?? '');
        out += `${indent}entity.playClip(${JSON.stringify(clip)}, ${f.loop === false ? 'false' : 'true'});\n`;
        break;
      }
      case 'world/stopClip':
        out += `${indent}entity.stopClip();\n`;
        break;
      case 'objective/complete':
        out += `${indent}world.completeObjective(${JSON.stringify(String(f.goal ?? ''))});\n`;
        break;
      case 'objective/addProgress':
        out += `${indent}world.addProgress(${JSON.stringify(String(f.goal ?? ''))}, ${this.inputExpr(nodeId, 'amount')});\n`;
        break;

      // ----- Camera control -----
      case 'camera/moveTo':
        out += `${indent}camera.moveTo(${this.inputExpr(nodeId, 'to')});\n`;
        break;
      case 'camera/lookAt':
        out += `${indent}camera.lookAt(${this.inputExpr(nodeId, 'target')});\n`;
        break;
      case 'camera/follow':
        out += `${indent}camera.follow(${this.inputExpr(nodeId, 'target')}, { distance: ${num(f.distance ?? 8)}, height: ${num(f.height ?? 4)} });\n`;
        break;
      case 'camera/shake':
        out += `${indent}camera.shake(${num(f.intensity ?? 0.3)}, ${num(f.duration ?? 0.3)});\n`;
        break;

      // ----- World / cross-entity control -----
      case 'world/setVisible':
        out += `${indent}world.setVisible(${this.inputExpr(nodeId, 'target')}, ${this.inputExpr(nodeId, 'visible')});\n`;
        break;
      case 'world/setActive':
        out += `${indent}world.setActive(${this.inputExpr(nodeId, 'target')}, ${this.inputExpr(nodeId, 'active')});\n`;
        break;
      case 'world/destroy':
        out += `${indent}world.destroy(${this.inputExpr(nodeId, 'target')});\n`;
        break;
      case 'world/spawn':
        out += `${indent}world.spawn(${this.inputExpr(nodeId, 'spawner')});\n`;
        break;
      case 'world/despawn':
        out += `${indent}world.despawn(${this.inputExpr(nodeId, 'target')});\n`;
        break;
      case 'world/teleport': {
        const v = this.inputExpr(nodeId, 'to');
        out += `${indent}{ const _v = ${v}; world.teleport(${this.inputExpr(nodeId, 'target')}, _v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'world/setVelocity': {
        const v = this.inputExpr(nodeId, 'v');
        out += `${indent}{ const _v = ${v}; world.setVelocity(${this.inputExpr(nodeId, 'target')}, _v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'world/applyImpulse': {
        const v = this.inputExpr(nodeId, 'v');
        out += `${indent}{ const _v = ${v}; world.applyImpulse(${this.inputExpr(nodeId, 'target')}, _v.x, _v.y, _v.z); }\n`;
        break;
      }
      case 'world/playEffect': {
        const name = String(f.name ?? '');
        out += `${indent}world.playEffect(${this.inputExpr(nodeId, 'target')}${name ? `, ${JSON.stringify(name)}` : ''});\n`;
        break;
      }

      case 'action/branch': {
        const lhs = this.inputExpr(nodeId, 'cond');
        const kind = this.sourceKind(nodeId, 'cond') ?? 'any';
        const path = String(f.path ?? 'value') as BranchPath;
        const op = String(f.op ?? 'is true');
        let rhs = '0';
        if (opNeedsRhs(op)) {
          const cmp = this.dataIn.get(`${nodeId}|compare`);
          if (cmp) rhs = this.outputExpr(cmp.source);
          else rhs = effectiveKind(kind, path) === 'string' ? JSON.stringify(String(f.rhs ?? '')) : num(f.rhs);
        }
        const cond = branchCondition({ lhsExpr: lhs, path, op, rhsExpr: rhs });
        out += `${indent}if (${cond}) {\n`;
        out += this.execChain(nodeId, 'then', indent + '  ', new Set(seen));
        out += `${indent}} else {\n`;
        out += this.execChain(nodeId, 'else', indent + '  ', new Set(seen));
        out += `${indent}}\n`;
        return out; // branches handle their own continuations
      }
      default:
        break;
    }

    // Continue the linear flow.
    out += this.execChain(nodeId, 'out', indent, seen);
    return out;
  }

  compileEvent(kind: string): string {
    const entry = [...this.byId.values()].find((n) => n.data.kind === kind);
    if (!entry) return '';
    const head = this.trace ? `  __node(${JSON.stringify(entry.id)});\n` : '';
    return head + this.execChain(entry.id, 'out', '  ', new Set());
  }

  /**
   * Edge-triggered "On Key Down" handlers, emitted into onUpdate. Each fires its
   * exec chain the frame its key goes from up→down; the previous frame's state
   * is remembered per node on entity.props so a held key fires only once. There
   * can be several (one per key), so unlike compileEvent this handles all of them.
   */
  compileKeyEvents(): string {
    let out = '';
    for (const node of this.byId.values()) {
      if (node.data.kind !== 'event/keyDown') continue;
      const key = JSON.stringify(String(node.data.fields?.key ?? 'space'));
      const stateKey = JSON.stringify(`__kd_${node.id}`);
      const head = this.trace ? `      __node(${JSON.stringify(node.id)});\n` : '';
      const body = this.execChain(node.id, 'out', '      ', new Set());
      out +=
        `  { const _kd = input.key(${key});\n` +
        `    if (_kd && !entity.props[${stateKey}]) {\n` +
        head +
        body +
        `    }\n` +
        `    entity.props[${stateKey}] = _kd; }\n`;
    }
    return out;
  }
}

export interface CodegenOptions {
  /** Inject `__node(id)` execution pings consumed by the live flow tracker. */
  trace?: boolean;
}

export function generateCode(graph: ScriptGraph, opts: CodegenOptions = {}): string {
  const c = new Compiler(graph, opts.trace);
  let start = c.compileEvent('event/start');
  let update = c.compileEvent('event/update');
  // "On Key Down" events run per-frame inside onUpdate (edge-detected).
  update += c.compileKeyEvents();
  const collision = c.compileEvent('physics/onCollision');
  const triggerEnter = c.compileEvent('trigger/onEnter');
  const triggerExit = c.compileEvent('trigger/onExit');
  const triggerStay = c.compileEvent('trigger/onStay');

  // Plug-and-play controllers ("asset/*"): each standalone node injects its
  // setup into onStart and its per-frame logic into onUpdate. No wiring needed.
  for (const node of graph.nodes) {
    const tmpl = ASSET_TEMPLATES[(node.data as EngineNodeData).kind];
    if (!tmpl) continue;
    const fields = (node.data as EngineNodeData).fields ?? {};
    const ping = opts.trace ? `  __node(${JSON.stringify(node.id)});\n` : '';
    start += ping + tmpl.onStart(fields);
    update += ping + tmpl.onUpdate(fields);
  }

  const header = `// ⚙ Generated from node graph — edits here switch the script to Code mode.\n`;
  let out =
    header +
    `function onStart(dt) {\n${start || '  // (no On Start nodes)\n'}}\n\n` +
    `function onUpdate(dt) {\n${update || '  // (no On Update nodes)\n'}}\n`;
  // Optional collision hook (from a physics/onCollision event node).
  if (collision) out += `\nfunction onCollision(other) {\n${collision}}\n`;
  // Optional trigger-volume hooks (from trigger/on* event nodes).
  if (triggerEnter) out += `\nfunction onTriggerEnter(other) {\n${triggerEnter}}\n`;
  if (triggerExit) out += `\nfunction onTriggerExit(other) {\n${triggerExit}}\n`;
  if (triggerStay) out += `\nfunction onTriggerStay(other) {\n${triggerStay}}\n`;
  return out;
}
