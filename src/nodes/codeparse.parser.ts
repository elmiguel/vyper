import type { Tok } from './codeparse.lexer';
import type { Expr, Stmt } from './codeparse.ir';

// ---------- recursive-descent parser over the token stream ----------

export class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok | undefined {
    return this.toks[this.p + o];
  }
  private next(): Tok {
    const t = this.toks[this.p++];
    if (!t) throw new Error('unexpected end of input');
    return t;
  }
  private isPunc(v: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'punc' && t.v === v;
  }
  private isId(v: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'id' && t.v === v;
  }
  private eatPunc(v: string) {
    if (!this.isPunc(v)) throw new Error(`expected "${v}"`);
    this.p++;
  }
  private eatId(v: string) {
    if (!this.isId(v)) throw new Error(`expected ${v}`);
    this.p++;
  }
  atEnd() {
    return this.p >= this.toks.length;
  }

  // ----- statements -----

  parseBody(): Stmt[] {
    const stmts: Stmt[] = [];
    while (!this.atEnd() && !this.isPunc('}')) {
      if (this.isPunc(';')) {
        this.p++;
        continue;
      }
      const st = this.parseStmt();
      stmts.push(st);
      // A branch has no linear continuation in node-land, so it must end the block.
      if (st.t === 'branch') {
        while (this.isPunc(';')) this.p++;
        if (!this.atEnd() && !this.isPunc('}')) {
          throw new Error('statements after an if/else cannot be represented as nodes');
        }
      }
    }
    return stmts;
  }

  private parseStmt(): Stmt {
    if (this.isId('if')) return this.parseIf();
    if (this.isPunc('{')) return this.parseVecCallBlock();
    if (this.isId('console')) return this.parseLog();
    if (this.isId('entity')) return this.parseEntity();
    if (this.isId('world')) return this.parseWorldStmt();
    throw new Error(`unsupported statement near "${this.peek()?.v ?? '<eof>'}"`);
  }

  // world.setProp(<target>, "key", <value>) — Set Property on another object.
  private parseWorldStmt(): Stmt {
    this.eatId('world');
    this.eatPunc('.');
    this.eatId('setProp');
    this.eatPunc('(');
    const target = this.parseExpr();
    this.eatPunc(',');
    const key = this.next();
    if (key.t !== 'str') throw new Error('setProp expects a string key');
    this.eatPunc(',');
    const value = this.parseExpr();
    this.eatPunc(')');
    if (this.isPunc(';')) this.p++;
    return { t: 'setProp', key: key.v, value, target };
  }

  private parseIf(): Stmt {
    this.eatId('if');
    this.eatPunc('(');
    const cond = this.parseExpr();
    this.eatPunc(')');
    this.eatPunc('{');
    const thenBody = this.parseBody();
    this.eatPunc('}');
    let elseBody: Stmt[] = [];
    if (this.isId('else')) {
      this.p++;
      this.eatPunc('{');
      elseBody = this.parseBody();
      this.eatPunc('}');
    }
    return { t: 'branch', cond, thenBody, elseBody };
  }

  private parseLog(): Stmt {
    this.eatId('console');
    this.eatPunc('.');
    this.eatId('log');
    this.eatPunc('(');
    const msg = this.parseExpr();
    this.eatPunc(')');
    if (this.isPunc(';')) this.p++;
    return { t: 'log', msg };
  }

  // entity.translate / rotate / setPosition / setProp
  private parseEntity(): Stmt {
    this.eatId('entity');
    this.eatPunc('.');
    const t = this.next();
    if (t.t === 'id' && (t.v === 'translate' || t.v === 'rotate')) {
      // direct form: entity.translate(NUM, NUM, NUM)
      this.eatPunc('(');
      const x = this.parseExpr();
      this.eatPunc(',');
      const y = this.parseExpr();
      this.eatPunc(',');
      const z = this.parseExpr();
      this.eatPunc(')');
      if (this.isPunc(';')) this.p++;
      return { t: t.v, by: { t: 'vec', x, y, z }, perSecond: false };
    }
    if (t.t === 'id' && t.v === 'setPosition') {
      this.eatPunc('(');
      const to = this.parseExpr();
      this.eatPunc(')');
      if (this.isPunc(';')) this.p++;
      return { t: 'setPosition', to };
    }
    if (t.t === 'id' && t.v === 'props') {
      const key = this.parseMemberKey();
      this.eatPunc('=');
      const value = this.parseExpr();
      if (this.isPunc(';')) this.p++;
      return { t: 'setProp', key, value };
    }
    throw new Error(`unsupported entity.${t.v}`);
  }

  // The canonical generated block: { const _v = <vec>; entity.translate(_v.x*dt, _v.y*dt, _v.z*dt); }
  private parseVecCallBlock(): Stmt {
    this.eatPunc('{');
    this.eatId('const');
    const varName = this.next();
    if (varName.t !== 'id') throw new Error('expected temp variable');
    this.eatPunc('=');
    const by = this.parseExpr();
    this.eatPunc(';');
    this.eatId('entity');
    this.eatPunc('.');
    const fn = this.next();
    if (fn.t !== 'id' || (fn.v !== 'translate' && fn.v !== 'rotate')) {
      throw new Error('expected translate/rotate in block');
    }
    this.eatPunc('(');
    const ps: boolean[] = [];
    for (const axis of ['x', 'y', 'z'] as const) {
      this.eatId(varName.v);
      this.eatPunc('.');
      this.eatId(axis);
      let per = false;
      if (this.isPunc('*')) {
        this.p++;
        this.eatId('dt');
        per = true;
      }
      ps.push(per);
      if (axis !== 'z') this.eatPunc(',');
    }
    this.eatPunc(')');
    if (this.isPunc(';')) this.p++;
    this.eatPunc('}');
    if (ps[0] !== ps[1] || ps[1] !== ps[2]) throw new Error('inconsistent *dt across axes');
    return { t: fn.v, by, perSecond: ps[0] };
  }

  private parseMemberKey(): string {
    // entity.props["k"]  OR  entity.props.k
    if (this.isPunc('[')) {
      this.p++;
      const k = this.next();
      if (k.t !== 'str') throw new Error('expected string property key');
      this.eatPunc(']');
      return k.v;
    }
    if (this.isPunc('.')) {
      this.p++;
      const k = this.next();
      if (k.t !== 'id') throw new Error('expected property name');
      return k.v;
    }
    throw new Error('expected property accessor');
  }

  // ----- expressions (precedence: +,- < *,/) -----

  parseExpr(): Expr {
    return this.parseAdd();
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.isPunc('+') || this.isPunc('-')) {
      const op = this.next().v;
      const right = this.parseMul();
      left = { t: 'math', op, a: left, b: right };
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parsePrimary();
    while (this.isPunc('*') || this.isPunc('/')) {
      const op = this.next().v;
      const right = this.parsePrimary();
      left = { t: 'math', op, a: left, b: right };
    }
    return left;
  }

  private parsePrimary(): Expr {
    // unary minus on a number literal
    if (this.isPunc('-') && this.peek(1)?.t === 'num') {
      this.p++;
      return { t: 'num', v: -Number(this.next().v) };
    }
    const t = this.peek();
    if (!t) throw new Error('unexpected end in expression');

    if (t.t === 'num') {
      this.p++;
      return { t: 'num', v: Number(t.v) };
    }
    if (t.t === 'str') {
      this.p++;
      return { t: 'str', v: t.v };
    }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') {
        this.p++;
        return { t: 'bool', v: t.v === 'true' };
      }
      if (t.v === 'vec') return this.parseVecLiteral();
      if (t.v === 'entity') return this.parseEntityExpr();
      if (t.v === 'time') return this.parseTimeExpr();
      if (t.v === 'input') return this.parseInputExpr();
      if (t.v === 'world') return this.parseWorldExpr();
      if (t.v === 'other') {
        this.p++;
        return { t: 'collisionOther' };
      }
      throw new Error(`unsupported identifier "${t.v}" in expression`);
    }
    if (this.isPunc('(')) return this.parseParen();
    throw new Error(`unsupported expression near "${t.v}"`);
  }

  private parseVecLiteral(): Expr {
    this.eatId('vec');
    this.eatPunc('(');
    const x = this.parseExpr();
    this.eatPunc(',');
    const y = this.parseExpr();
    this.eatPunc(',');
    const z = this.parseExpr();
    this.eatPunc(')');
    return { t: 'vec', x, y, z };
  }

  private parseEntityExpr(): Expr {
    this.eatId('entity');
    this.eatPunc('.');
    const m = this.next();
    if (m.t === 'id' && m.v === 'position') return { t: 'pos' };
    if (m.t === 'id' && m.v === 'props') {
      const key = this.parseMemberKey();
      return { t: 'prop', key };
    }
    throw new Error(`unsupported entity.${m.v} value`);
  }

  // world.findObject("name")  |  world.getProp(<target>, "key")
  private parseWorldExpr(): Expr {
    this.eatId('world');
    this.eatPunc('.');
    const fn = this.next();
    if (fn.t === 'id' && fn.v === 'findObject') {
      this.eatPunc('(');
      const nm = this.next();
      if (nm.t !== 'str') throw new Error('findObject expects a string name');
      this.eatPunc(')');
      return { t: 'object', name: nm.v };
    }
    if (fn.t === 'id' && fn.v === 'getProp') {
      this.eatPunc('(');
      const target = this.parseExpr();
      this.eatPunc(',');
      const k = this.next();
      if (k.t !== 'str') throw new Error('getProp expects a string key');
      this.eatPunc(')');
      return { t: 'prop', key: k.v, target };
    }
    throw new Error(`unsupported world.${fn.v}`);
  }

  private parseTimeExpr(): Expr {
    this.eatId('time');
    this.eatPunc('.');
    const m = this.next();
    if (m.t === 'id' && m.v === 'elapsed') return { t: 'time' };
    throw new Error(`unsupported time.${m.v}`);
  }

  private parseInputExpr(): Expr {
    this.eatId('input');
    this.eatPunc('.');
    this.eatId('key');
    this.eatPunc('(');
    const k = this.next();
    if (k.t !== 'str') throw new Error('input.key expects a string');
    this.eatPunc(')');
    return { t: 'key', key: k.v };
  }

  // Parenthesised: grouping, the (x ?? 0) prop default, or the (b !== 0 ? a / b : 0) divide guard.
  private parseParen(): Expr {
    const save = this.p;
    this.eatPunc('(');
    // try the divide-guard pattern first
    try {
      const b = this.parseExpr();
      if (this.isPunc('!==') && this.peek(1)?.t === 'num' && this.peek(1)!.v === '0') {
        this.p += 2; // !== 0
        this.eatPunc('?');
        const a = this.parseExpr();
        this.eatPunc('/');
        const b2 = this.parseExpr();
        this.eatPunc(':');
        const zero = this.next();
        if (!(zero.t === 'num' && Number(zero.v) === 0)) throw new Error('bad guard');
        this.eatPunc(')');
        if (JSON.stringify(b) !== JSON.stringify(b2)) throw new Error('guard divisor mismatch');
        return { t: 'math', op: '/', a, b };
      }
    } catch {
      /* fall through to normal grouping */
    }
    this.p = save;
    this.eatPunc('(');
    const inner = this.parseExpr();
    // (expr ?? 0) — nullish default emitted around Get Property
    if (this.isPunc('??')) {
      this.p++;
      this.parseExpr(); // discard the default
    }
    this.eatPunc(')');
    return inner;
  }
}
