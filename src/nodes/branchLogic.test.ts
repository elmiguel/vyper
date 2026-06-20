import { describe, it, expect } from 'vitest';
import { checksFor, effectiveKind, operatorsFor, opNeedsRhs, coerceOp, branchCondition } from './branchLogic';

describe('branchLogic — checks & operators', () => {
  it('offers vec3 components + length to check, just the value otherwise', () => {
    expect(checksFor('vec3')).toEqual(['value', 'x', 'y', 'z', 'length']);
    expect(checksFor('number')).toEqual(['value']);
    expect(checksFor('bool')).toEqual(['value']);
  });

  it('treats a vec3 component/length as a number', () => {
    expect(effectiveKind('vec3', 'y')).toBe('number');
    expect(effectiveKind('vec3', 'length')).toBe('number');
    expect(effectiveKind('vec3', 'value')).toBe('vec3');
    expect(effectiveKind('number', 'value')).toBe('number');
  });

  it('gives numeric operators for numbers and vec3 components', () => {
    expect(operatorsFor('number', 'value')).toContain('>=');
    expect(operatorsFor('vec3', 'y')).toContain('<');
  });

  it('gives truthiness operators for bools', () => {
    expect(operatorsFor('bool', 'value')).toEqual(['is true', 'is false']);
  });

  it('gives equality operators for strings and entities', () => {
    expect(operatorsFor('string', 'value')).toEqual(['==', '!=']);
    expect(operatorsFor('entity', 'value')).toEqual(['==', '!=']);
  });

  it('opNeedsRhs is false only for the unary truthiness ops', () => {
    expect(opNeedsRhs('is true')).toBe(false);
    expect(opNeedsRhs('is false')).toBe(false);
    expect(opNeedsRhs('>')).toBe(true);
    expect(opNeedsRhs('==')).toBe(true);
  });

  it('coerceOp keeps a valid op and snaps an invalid one to the first available', () => {
    expect(coerceOp('>', 'number', 'value')).toBe('>');
    expect(coerceOp('>', 'bool', 'value')).toBe('is true'); // '>' invalid for bool
  });
});

describe('branchLogic — condition expressions', () => {
  it('compiles a numeric comparison on a vec3 component', () => {
    expect(branchCondition({ lhsExpr: 'entity.position', path: 'y', op: '>', rhsExpr: '5' }))
      .toBe('(entity.position).y > 5');
  });

  it('uses Math.hypot for the length check', () => {
    expect(branchCondition({ lhsExpr: 'v', path: 'length', op: '<=', rhsExpr: '10' }))
      .toBe('Math.hypot((v).x, (v).y, (v).z) <= 10');
  });

  it('maps == / != to strict equality', () => {
    expect(branchCondition({ lhsExpr: 'a', path: 'value', op: '==', rhsExpr: 'b' })).toBe('(a) === b');
    expect(branchCondition({ lhsExpr: 'a', path: 'value', op: '!=', rhsExpr: 'b' })).toBe('(a) !== b');
  });

  it('emits a unary truthiness test for is true / is false (rhs ignored)', () => {
    expect(branchCondition({ lhsExpr: 'flag', path: 'value', op: 'is true', rhsExpr: '0' })).toBe('!!(flag)');
    expect(branchCondition({ lhsExpr: 'flag', path: 'value', op: 'is false', rhsExpr: '0' })).toBe('!(flag)');
  });
});
