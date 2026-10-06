// Which lines of the editor changed since the last commit, for the margin
// markers: a line diff (Myers' algorithm) grouped into added, modified and
// deleted regions. Line numbers are 1-based lines of the new text.

export type LineChange =
  | { kind: "added"; from: number; to: number }
  | { kind: "modified"; from: number; to: number }
  /** Lines were removed after line `after` (0: at the top). */
  | { kind: "deleted"; after: number };

/** Edit script between `a` and `b` as [aIndex, bIndex] pairs of equal lines. */
function commonLines(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max]) ? v[k + 1 + max] : v[k - 1 + max] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) (x++, y++);
      v[k + max] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, d, max);
    }
  }
  return [];
}

function backtrack(trace: Int32Array[], a: string[], b: string[], dEnd: number, max: number): [number, number][] {
  const pairs: [number, number][] = [];
  let x = a.length;
  let y = b.length;
  for (let d = dEnd; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max]) ? k + 1 : k - 1;
    const prevX = v[prevK + max];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) pairs.push([--x, --y]);
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

/** Changed regions of `newText` compared with `oldText`. */
export function lineChanges(oldText: string, newText: string): LineChange[] {
  const a = oldText.replace(/\r\n/g, "\n").split("\n");
  const b = newText.replace(/\r\n/g, "\n").split("\n");
  // Trim the common head and tail first: most edits are small.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);
  // Very large rewrites: one region, without the quadratic search.
  const pairs: [number, number][] = am.length * bm.length > 4_000_000 ? [] : commonLines(am, bm);
  const out: LineChange[] = [];
  let ai = 0;
  let bi = 0;
  const flush = (aEnd: number, bEnd: number) => {
    const removed = aEnd - ai;
    const added = bEnd - bi;
    const line = head + bi + 1;
    if (removed > 0 && added > 0) out.push({ kind: "modified", from: line, to: line + added - 1 });
    else if (added > 0) out.push({ kind: "added", from: line, to: line + added - 1 });
    else if (removed > 0) out.push({ kind: "deleted", after: head + bi });
  };
  for (const [pa, pb] of pairs) {
    flush(pa, pb);
    ai = pa + 1;
    bi = pb + 1;
  }
  flush(am.length, bm.length);
  return out;
}
