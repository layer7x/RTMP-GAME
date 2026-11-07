(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.Level = f(); })(typeof self !== 'undefined' ? self : this, function () {
  function build() {
    let seed = 12345;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const N = 14, C = 16, S = N * C, WH = 14, TH = 2, solids = [], ramps = [], open = {};
    const wall = (cx, cz, w, d) => solids.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, top: WH });
    wall(S / 2, 0, S + TH, TH); wall(S / 2, S, S + TH, TH); wall(0, S / 2, TH, S + TH); wall(S, S / 2, TH, S + TH);
    const seen = Array.from({ length: N }, () => Array(N).fill(false)), D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const pk = (i, j, d) => d === 0 ? i + ',' + j + ',0' : d === 1 ? i + ',' + j + ',1' : d === 2 ? (i - 1) + ',' + j + ',0' : i + ',' + (j - 1) + ',1';
    const st = [[0, 0]]; seen[0][0] = true;
    while (st.length) {
      const [i, j] = st[st.length - 1], nb = [];
      D.forEach((d, k) => { const a = i + d[0], b = j + d[1]; if (a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]) nb.push(k); });
      if (!nb.length) { st.pop(); continue; }
      const k = nb[Math.floor(rnd() * nb.length)];
      open[pk(i, j, k)] = true;
      const a = i + D[k][0], b = j + D[k][1]; seen[a][b] = true; st.push([a, b]);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i < N - 1 && rnd() < 0.18) open[i + ',' + j + ',0'] = true;
      if (j < N - 1 && rnd() < 0.18) open[i + ',' + j + ',1'] = true;
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N; j++) if (!open[i + ',' + j + ',0']) wall((i + 1) * C, (j + 0.5) * C, TH, C + TH);
    for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) if (!open[i + ',' + j + ',1']) wall((i + 0.5) * C, (j + 1) * C, C + TH, TH);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + 2 * j) % 5 === 3) {
      const cx = (i + 0.5) * C, cz = (j + 0.5) * C;
      ramps.push({ x0: cx - 4.5, x1: cx + 4.5, z0: cz - 4.5, z1: cz + 4.5, h: 5, ax: (i + j) % 2 ? 'x' : 'z', sg: i % 2 ? 1 : -1 });
    }
    return { N, C, S, WH, TH, solids, ramps, open };
  }
  return { build };
});
