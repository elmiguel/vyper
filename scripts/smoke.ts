import { generateCode } from '../src/nodes/codegen';
import { parseGraph } from '../src/nodes/codeparse';
import { starterGraph, makeNode } from '../src/nodes/nodeTypes';
import type { Edge, Node } from '@xyflow/react';

// 1. Generate from the starter graph.
const code = generateCode(starterGraph());
console.log('=== generated (starter) ===\n' + code);

// 2. Compile it the same way ScriptRuntime does and run the lifecycle.
function compileAndRun(src: string) {
  const factory = new Function(
    'entity', 'scene', 'input', 'time', 'vec', 'console',
    `${src}\n; return { onStart: typeof onStart!=='undefined'?onStart:null, onUpdate: typeof onUpdate!=='undefined'?onUpdate:null };`,
  );
  const entity = {
    props: { health: 5 } as Record<string, number>,
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    translate(x: number, y = 0, z = 0) { this.position.x += x; this.position.y += y; this.position.z += z; },
    rotate(x: number, y = 0, z = 0) { this.rotation.x += x; this.rotation.y += y; this.rotation.z += z; },
    setPosition(v: any) { this.position = { ...v }; },
  };
  const input = { key: (_: string) => false, axisX: 0, axisY: 0 };
  const time = { elapsed: 1.5, delta: 0.016 };
  const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const logs: string[] = [];
  const cns = { log: (...a: any[]) => logs.push(a.join(' ')), info() {}, warn() {}, error() {}, debug() {} };
  const lc = factory(entity, {}, input, time, vec, cns);
  lc.onStart?.(0);
  lc.onUpdate?.(0.5);
  return { entity, logs };
}

const r1 = compileAndRun(code);
console.log('\nstarter onStart logs:', r1.logs);
console.log('starter rotation after 0.5s update:', r1.entity.rotation, '(expect y≈30 from 60deg/s)');

// 3. Build a graph with a branch + math + prop to exercise data resolution.
const start = makeNode('event/start', { x: 0, y: 0 });
const branch = makeNode('action/branch', { x: 300, y: 0 });
const logTrue = makeNode('action/log', { x: 600, y: -60 });
logTrue.data.fields.msg = 'cond true';
const logFalse = makeNode('action/log', { x: 600, y: 80 });
logFalse.data.fields.msg = 'cond false';
const math = makeNode('value/math', { x: 0, y: 200 });
math.data.fields = { op: '>', a: 3, b: 1 } as any; // op falls back to '+', still numeric → truthy
const setProp = makeNode('action/setProp', { x: 600, y: 200 });
setProp.data.fields = { key: 'health', value: 99 } as any;

const nodes: Node[] = [start, branch, logTrue, logFalse];
const edges: Edge[] = [
  { id: 'a', source: start.id, sourceHandle: 'exec-out', target: branch.id, targetHandle: 'exec-in' },
  { id: 'b', source: branch.id, sourceHandle: 'exec-then', target: logTrue.id, targetHandle: 'exec-in' },
  { id: 'c', source: branch.id, sourceHandle: 'exec-else', target: logFalse.id, targetHandle: 'exec-in' },
];
const code2 = generateCode({ nodes, edges });
console.log('\n=== generated (branch) ===\n' + code2);
const r2 = compileAndRun(code2);
console.log('branch logs (cond default true → expect "cond true"):', r2.logs);

// 4. Round-trip: code → graph → code must be stable (bi-directional sync).
function normalize(s: string) {
  return s.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
}
function roundTrip(label: string, graph: { nodes: Node[]; edges: Edge[] }) {
  const code1 = generateCode(graph);
  const reparsed = parseGraph(code1);
  if (!reparsed) {
    console.log(`✗ ${label}: code did not parse back into a graph`);
    return;
  }
  const code2 = generateCode(reparsed);
  const ok = normalize(code1) === normalize(code2);
  console.log(`${ok ? '✓' : '✗'} ${label}: round-trip ${ok ? 'stable' : 'DIVERGED'}`);
  if (!ok) {
    console.log('  --- first ---\n' + code1);
    console.log('  --- second ---\n' + code2);
  }
}

console.log('\n=== code ↔ graph round-trip ===');
roundTrip('starter (log + rotate*dt)', starterGraph());
roundTrip('branch + nested logs', { nodes, edges });

// A hand-written-style body exercising values: math, prop, key, position.
const upd = makeNode('event/update', { x: 0, y: 0 });
const setPos = makeNode('action/setPosition', { x: 300, y: 0 });
const mathN = makeNode('value/math', { x: 0, y: 200 });
mathN.data.fields = { op: '*', a: 2, b: 0 } as any;
const getProp = makeNode('value/prop', { x: -300, y: 200 });
getProp.data.fields = { key: 'speed' } as any;
const richNodes: Node[] = [upd, setPos, mathN, getProp];
const richEdges: Edge[] = [
  { id: 'u', source: upd.id, sourceHandle: 'exec-out', target: setPos.id, targetHandle: 'exec-in' },
  { id: 'm', source: mathN.id, sourceHandle: 'out-out', target: setPos.id, targetHandle: 'in-to' },
  { id: 'g', source: getProp.id, sourceHandle: 'out-out', target: mathN.id, targetHandle: 'in-a' },
];
// (setPosition wants a vec3; feeding it a number is a type-soup case, but exercises
//  value-node reconstruction through math → prop. We only check it parses + restabilizes.)
roundTrip('math ← prop chain', { nodes: richNodes, edges: richEdges });

// Unsupported code must fail safe (return null), not throw.
const bad = parseGraph('function onUpdate(dt){ for (let i=0;i<3;i++) entity.translate(1,0,0); }');
console.log(`${bad === null ? '✓' : '✗'} unsupported code → null (keeps code as source of truth)`);

console.log('\nALL SMOKE CHECKS RAN');
