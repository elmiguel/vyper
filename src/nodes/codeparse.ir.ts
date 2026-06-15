// ---------- expression IR ----------

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'vec'; x: Expr; y: Expr; z: Expr }
  | { t: 'pos' }
  | { t: 'prop'; key: string; target?: Expr }
  | { t: 'time' }
  | { t: 'key'; key: string }
  | { t: 'math'; op: string; a: Expr; b: Expr }
  // entity references
  | { t: 'collisionOther' } // the `other` param inside onCollision
  | { t: 'object'; name: string }; // world.findObject("name")

export type Stmt =
  | { t: 'log'; msg: Expr }
  | { t: 'translate'; by: Expr; perSecond: boolean }
  | { t: 'rotate'; by: Expr; perSecond: boolean }
  | { t: 'setPosition'; to: Expr }
  | { t: 'setProp'; key: string; value: Expr; target?: Expr }
  | { t: 'branch'; cond: Expr; thenBody: Stmt[]; elseBody: Stmt[] };
