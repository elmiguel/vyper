// ---------- tokenizer ----------

export type Tok = { t: 'num' | 'str' | 'id' | 'punc'; v: string };

const MULTI = ['!==', '??']; // multi-char punctuation, longest-first
const SINGLE = '.,;(){}[]=*+-/?:!<>';

export function stripComments(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') out += src[i++];
        out += src[i++];
      }
      out += src[i++] ?? '';
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_$]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let s = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') {
          const n = src[i + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else s += src[i++];
      }
      i++; // closing quote
      toks.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let n = '';
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      toks.push({ t: 'num', v: n });
      continue;
    }
    if (isIdStart(c)) {
      let id = '';
      while (i < src.length && isId(src[i])) id += src[i++];
      toks.push({ t: 'id', v: id });
      continue;
    }
    const three = src.slice(i, i + 3);
    const m = MULTI.find((p) => three.startsWith(p));
    if (m) {
      toks.push({ t: 'punc', v: m });
      i += m.length;
      continue;
    }
    if (SINGLE.includes(c)) {
      toks.push({ t: 'punc', v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected char ${c}`);
  }
  return toks;
}
