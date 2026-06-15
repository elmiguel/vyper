/**
 * Lightweight vector with chainable helpers, handed to scripts as `vec(...)` and
 * returned by the camera helper. Plain `{x,y,z}` reads still work, so existing
 * generated code is unaffected; controller boilerplate can use `.scale()/.add()`.
 */
export class V {
  constructor(public x = 0, public y = 0, public z = 0) {}
  add(o: { x: number; y: number; z: number }) {
    return new V(this.x + o.x, this.y + o.y, this.z + o.z);
  }
  scale(s: number) {
    return new V(this.x * s, this.y * s, this.z * s);
  }
  get length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  normalize() {
    const l = this.length || 1;
    return new V(this.x / l, this.y / l, this.z / l);
  }
}

export function vec(x = 0, y = 0, z = 0) {
  return new V(x, y, z);
}
