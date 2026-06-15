import type { ScriptGraph } from '@/types';
import { stripComments, tokenize } from './codeparse.lexer';
import { Parser } from './codeparse.parser';
import { GraphBuilder } from './codeparse.graph';

/**
 * Code → node graph: the reverse half of the round-trip. Parses the constrained
 * JavaScript dialect that `codegen.ts` emits (and reasonable hand-written
 * equivalents) back into a React-Flow graph, so edits in the Code tab flow into
 * the Nodes tab. Anything the node vocabulary can't express makes this return
 * `null`, and the caller keeps code as the source of truth instead of clobbering
 * the graph.
 *
 * Supported, mirroring codegen exactly:
 *   actions  console.log(str) · entity.translate/rotate({…}*dt?) · entity.setPosition(v)
 *            entity.props["k"] = v · if (cond) {…} else {…}
 *   values   number · vec(x,y,z) · entity.position · (entity.props["k"] ?? 0)
 *            time.elapsed · input.key("k") · a (+|-|*|/) b
 */

// ---------- function-body extraction ----------

function extractBody(src: string, name: string): string | null {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`);
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return src.slice(start, i - 1);
}

/**
 * Parse generated-style JS into a node graph. Returns null when the code uses
 * anything the node graph can't represent (the caller then keeps the code as the
 * source of truth and flags the graph as out of date).
 */
export function parseGraph(code: string): ScriptGraph | null {
  try {
    const clean = stripComments(code);
    const startBody = extractBody(clean, 'onStart');
    const updateBody = extractBody(clean, 'onUpdate');
    const collisionBody = extractBody(clean, 'onCollision');
    if (startBody === null && updateBody === null && collisionBody === null) return null;

    const b = new GraphBuilder();

    const addEvent = (kind: string, body: string | null, x: number, y: number) => {
      if (body === null) return;
      const stmts = new Parser(tokenize(body)).parseBody();
      if (stmts.length === 0) return; // empty body → no event node, matches codegen
      const ev = b.event(kind, x, y);
      // The collision node is the source of the `other` reference for its chain.
      if (kind === 'physics/onCollision') b.collisionNodeId = ev.id;
      b.buildChain(stmts, ev.id, 'exec-out', x + 240, y);
    };

    addEvent('event/start', startBody, 40, 40);
    // stack each subsequent event below whatever the previous one produced
    const nextY = () => (b.nodes.length ? Math.max(...b.nodes.map((n) => n.position.y)) + 200 : 40);
    addEvent('event/update', updateBody, 40, nextY());
    addEvent('physics/onCollision', collisionBody, 40, nextY());

    return { nodes: b.nodes, edges: b.edges };
  } catch {
    return null;
  }
}
