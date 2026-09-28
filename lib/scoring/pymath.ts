// Exact ports of the two Python behaviours the reference engine depends on:
//  - round(x, n): correctly rounded on the binary value, ties to even (JS toFixed ties away)
//  - difflib.SequenceMatcher(None, a, b).ratio(), including the autojunk heuristic for len(b) >= 200

export function pyRound(x: number, n = 0): number {
  if (!Number.isFinite(x)) return x;
  // x is an exact decimal tie at n digits iff x * 2^(n+1) is an odd integer (powers of 2 multiply exactly).
  const t = x * 2 ** (n + 1);
  if (Number.isInteger(t) && Math.abs(t % 2) === 1) {
    const scaled = x * 10 ** n; // k + 0.5 exactly
    const lo = Math.floor(scaled);
    const even = lo % 2 === 0 ? lo : lo + 1;
    return even / 10 ** n;
  }
  return Number(x.toFixed(n)); // toFixed rounds the exact binary value; non-ties agree with Python
}

type Block = [number, number, number];

/** difflib.SequenceMatcher with isjunk=None, autojunk=True. Operates on code points like Python str. */
export class SequenceMatcher {
  private a: string[];
  private b: string[];
  private b2j = new Map<string, number[]>();

  constructor(a: string, b: string) {
    this.a = Array.from(a);
    this.b = Array.from(b);
    this.chainB();
  }

  private chainB() {
    const b = this.b;
    for (let i = 0; i < b.length; i++) {
      const list = this.b2j.get(b[i]);
      if (list) list.push(i);
      else this.b2j.set(b[i], [i]);
    }
    const n = b.length;
    if (n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, idxs] of [...this.b2j]) if (idxs.length > ntest) this.b2j.delete(elt);
    }
  }

  private findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Block {
    const { a, b, b2j } = this;
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      const idxs = b2j.get(a[i]);
      if (idxs) {
        for (const j of idxs) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) ?? 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      j2len = newj2len;
    }
    // isjunk is None, so bjunk is empty: extend over "popular" elements that autojunk removed.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--; bestj--; bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return [besti, bestj, bestsize];
  }

  matchingBlocks(): Block[] {
    const la = this.a.length, lb = this.b.length;
    const queue: [number, number, number, number][] = [[0, la, 0, lb]];
    const blocks: Block[] = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const x = this.findLongestMatch(alo, ahi, blo, bhi);
      const [i, j, k] = x;
      if (k) {
        blocks.push(x);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    return blocks;
  }

  ratio(): number {
    const matches = this.matchingBlocks().reduce((s, [, , k]) => s + k, 0);
    const total = this.a.length + this.b.length;
    return total ? (2.0 * matches) / total : 1.0;
  }
}
