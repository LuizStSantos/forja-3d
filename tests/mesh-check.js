// Confere um STL binário como um fatiador: vértices com os mesmos bytes são o mesmo ponto
// (0 e -0 contam como pontos diferentes) e cada aresta precisa ser usada por exatamente dois
// triângulos, em sentidos opostos.
module.exports = function meshCheck(buf) {
  const dv = new DataView(buf), n = dv.getUint32(80, true);
  const ids = new Map();
  const vid = (o) => {
    const k = dv.getUint32(o, true) + ',' + dv.getUint32(o + 4, true) + ',' + dv.getUint32(o + 8, true);
    let i = ids.get(k);
    if (i === undefined) { i = ids.size; ids.set(k, i); }
    return i;
  };
  const edges = new Map();
  let degenerate = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const v = [vid(o), vid(o + 12), vid(o + 24)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) { degenerate++; continue; }
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const key = a < b ? a + '_' + b : b + '_' + a;
      const e = edges.get(key) || { n: 0, fwd: 0 };
      e.n++; if (a < b) e.fwd++;
      edges.set(key, e);
    }
  }
  let open = 0, multi = 0, flipped = 0;
  for (const e of edges.values()) { if (e.n === 1) open++; else if (e.n > 2) multi++; else if (e.fwd !== 1) flipped++; }
  return { triangles: n, open, multi, flipped, degenerate, bad: open + multi + flipped };
};
