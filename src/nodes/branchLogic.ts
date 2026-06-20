import type { DataKind } from './nodeSpec.types';

/** Which part of the incoming value a Branch tests. vec3 exposes components + length. */
export type BranchPath = 'value' | 'x' | 'y' | 'z' | 'length';

/**
 * Branch (if) helpers. A Branch takes ANY value, lets the user pick what to check, an operator,
 * and what to compare against — then emits a boolean condition for codegen. Kept pure + dependency
 * free so both the node UI (BranchControls) and the compiler (codegen) agree on the same rules and
 * the whole thing is unit-testable without a graph.
 */

/** "What to check" options for a value kind: vec3 → its components/length, else the value itself. */
export function checksFor(kind: DataKind): BranchPath[] {
  return kind === 'vec3' ? ['value', 'x', 'y', 'z', 'length'] : ['value'];
}

/** Reduce (kind, path) to the kind actually compared — a vec3 component/length is a number. */
export function effectiveKind(kind: DataKind, path: BranchPath): DataKind {
  if (kind === 'vec3' && path !== 'value') return 'number';
  return kind;
}

/** Comparison operators valid for the effective kind being checked. */
export function operatorsFor(kind: DataKind, path: BranchPath): string[] {
  switch (effectiveKind(kind, path)) {
    case 'number': return ['>', '>=', '<', '<=', '==', '!='];
    case 'bool': return ['is true', 'is false'];
    case 'string': return ['==', '!='];
    case 'entity': return ['==', '!='];
    case 'vec3': return ['is true', 'is false']; // a whole vector: truthiness only
    default: return ['is true', 'is false', '==', '!=', '>', '>=', '<', '<=']; // 'any'/unknown
  }
}

/** True when the operator needs a right-hand operand (vs a unary truthiness test). */
export function opNeedsRhs(op: string): boolean {
  return op !== 'is true' && op !== 'is false';
}

/** Clamp an operator to one valid for the kind/path (used when the incoming kind changes). */
export function coerceOp(op: string, kind: DataKind, path: BranchPath): string {
  const ops = operatorsFor(kind, path);
  return ops.includes(op) ? op : ops[0];
}

function accessor(expr: string, path: BranchPath): string {
  if (path === 'x' || path === 'y' || path === 'z') return `(${expr}).${path}`;
  if (path === 'length') return `Math.hypot((${expr}).x, (${expr}).y, (${expr}).z)`;
  return `(${expr})`;
}

export interface BranchParams {
  /** Expression for the value being tested (connected source or literal). */
  lhsExpr: string;
  /** Which part of it to check. */
  path: BranchPath;
  /** Operator label (see {@link operatorsFor}). */
  op: string;
  /** Expression for the compare value (ignored for unary ops). */
  rhsExpr: string;
}

/** Build the boolean JS condition for a Branch from its operands + operator. */
export function branchCondition({ lhsExpr, path, op, rhsExpr }: BranchParams): string {
  const lhs = accessor(lhsExpr, path);
  switch (op) {
    case 'is true': return `!!${lhs}`;
    case 'is false': return `!${lhs}`;
    case '==': return `${lhs} === ${rhsExpr}`;
    case '!=': return `${lhs} !== ${rhsExpr}`;
    case '>':
    case '>=':
    case '<':
    case '<=': return `${lhs} ${op} ${rhsExpr}`;
    default: return `!!${lhs}`;
  }
}
