/* Forja 3D — motor compatível com a linguagem OpenSCAD.
   3D: Manifold (o mesmo motor do OpenSCAD atual). 2D: Clipper (o mesmo do OpenSCAD). Texto: fonte de traço do JSCAD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('@jscad/modeling'), require('clipper-lib'), require('opentype.js'));
  else root.ForjaEngine = factory(root.jscadModeling, root.ClipperLib, root.opentype);
})(typeof self !== 'undefined' ? self : this, function (J, CL, OT) {
  'use strict';

  const DEG = Math.PI / 180;

  // ───────────────────────────── Fontes (opentype.js) ─────────────────────────────
  const FONTS = new Map(); // 'familia|estilo' -> fonte
  function normStyle(s) {
    s = String(s || 'regular').toLowerCase();
    const b = /bold|negrito|700|800|900/.test(s), i = /italic|oblique|italico|itálico/.test(s);
    return b && i ? 'bold italic' : b ? 'bold' : i ? 'italic' : 'regular';
  }
  function parseFontSpec(spec) {
    const parts = String(spec).split(':');
    let st = 'regular';
    for (const p of parts.slice(1)) { const m = /^\s*style\s*=\s*(.*)$/i.exec(p); if (m) st = m[1]; }
    return { fam: parts[0].trim().toLowerCase(), st: normStyle(st) };
  }
  // registra uma fonte (ArrayBuffer .ttf/.otf/.woff) sob o nome e estilo dados
  function setFont(family, style, data) {
    if (!OT) return false;
    const key = String(family).trim().toLowerCase() + '|' + normStyle(style);
    if (FONTS.has(key)) return true;
    try { FONTS.set(key, OT.parse(data)); return true; } catch (e) { return false; }
  }
  const hasFont = (spec) => { const f = parseFontSpec(spec); return FONTS.has(f.fam + '|' + f.st); };
  function findFont(spec) {
    const f = parseFontSpec(spec);
    return FONTS.get(f.fam + '|' + f.st) || FONTS.get(f.fam + '|regular') || null;
  }
  // contornos do texto com uma fonte de verdade: tamanho = altura das maiúsculas, como no OpenSCAD
  function fontRings(font, str, size, spacing, seg) {
    const upm = font.unitsPerEm || 1000;
    const os2 = font.tables && font.tables.os2;
    const cap = (os2 && os2.sCapHeight > 0 ? os2.sCapHeight : upm * 0.7);
    const k = size / cap;
    const lineH = size * 1.45;
    const rings = [];
    str.split('\n').forEach((ln, li) => {
      const glyphs = font.stringToGlyphs(ln);
      let x = 0;
      glyphs.forEach((g, i) => {
        const cmds = g.getPath(0, 0, upm).commands;
        let ring = null, cx = 0, cy = 0;
        const X = (u) => (x + u) * k, Y = (v) => -v * k - li * lineH;
        const push = (u, v) => ring.push([X(u), Y(v)]);
        const close = () => { if (ring && ring.length >= 3) rings.push(ring); ring = null; };
        for (const c of cmds) {
          if (c.type === 'M') { close(); ring = []; cx = c.x; cy = c.y; push(cx, cy); }
          else if (c.type === 'L') { cx = c.x; cy = c.y; push(cx, cy); }
          else if (c.type === 'Q') {
            for (let n = 1; n <= seg; n++) { const t = n / seg, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; push(a * cx + b * c.x1 + d * c.x, a * cy + b * c.y1 + d * c.y); }
            cx = c.x; cy = c.y;
          } else if (c.type === 'C') {
            for (let n = 1; n <= seg; n++) { const t = n / seg, u = 1 - t; push(u * u * u * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y); }
            cx = c.x; cy = c.y;
          } else if (c.type === 'Z') close();
        }
        close();
        let adv = (g.advanceWidth || 0) * spacing;
        if (i + 1 < glyphs.length) { try { adv += font.getKerningValue(g, glyphs[i + 1]) * spacing; } catch (e) { /* sem kerning */ } }
        x += adv;
      });
    });
    return rings;
  }

  // ───────────────────────────── 2D (Clipper, como no OpenSCAD) ─────────────────────────────
  // Formas 2D são listas de contornos fechados: externos no sentido anti-horário, furos no horário.
  const CS = 1e5; // escala para coordenadas inteiras (0,00001 mm)
  const NZ = CL.PolyFillType.pftNonZero, EO = CL.PolyFillType.pftEvenOdd;
  const P2 = {
    toC(paths) {
      const out = [];
      for (const p of paths) {
        if (!p || p.length < 3) continue;
        out.push(p.map((q) => ({ X: Math.round(q[0] * CS), Y: Math.round(q[1] * CS) })));
      }
      return out;
    },
    fromC(cp) {
      const out = [];
      for (const p of cp) if (p.length >= 3 && Math.abs(CL.Clipper.Area(p)) > 1) out.push(p.map((q) => [q.X / CS, q.Y / CS]));
      return out;
    },
    exec(type, subj, clip, fill) {
      const c = new CL.Clipper();
      if (subj.length) c.AddPaths(subj, CL.PolyType.ptSubject, true);
      if (clip && clip.length) c.AddPaths(clip, CL.PolyType.ptClip, true);
      const sol = new CL.Paths();
      c.Execute(type, sol, fill, fill);
      return sol;
    },
    sanitize(paths, evenOdd) { return P2.fromC(P2.exec(CL.ClipType.ctUnion, P2.toC(paths), null, evenOdd ? EO : NZ)); },
    union(list) { return P2.sanitize([].concat(...list)); },
    difference(a, tools) {
      const t = [].concat(...tools);
      if (!t.length) return a;
      return P2.fromC(P2.exec(CL.ClipType.ctDifference, P2.toC(a), P2.toC(t), NZ));
    },
    intersection(list) {
      let acc = P2.toC(list[0]);
      for (let i = 1; i < list.length; i++) acc = P2.exec(CL.ClipType.ctIntersection, acc, P2.toC(list[i]), NZ);
      return P2.fromC(acc);
    },
    offset(paths, delta, join, arcTol) {
      const jt = join === 'round' ? CL.JoinType.jtRound : join === 'square' ? CL.JoinType.jtSquare : CL.JoinType.jtMiter;
      const co = new CL.ClipperOffset(1e6, Math.max(arcTol * CS, 0.25));
      co.AddPaths(P2.toC(paths), jt, CL.EndType.etClosedPolygon);
      const sol = new CL.Paths();
      co.Execute(sol, delta * CS);
      return P2.fromC(sol);
    },
    strokes(lines, w) {
      const co = new CL.ClipperOffset(2, w * 0.02 * CS);
      co.AddPaths(lines.map((l) => l.map((q) => ({ X: Math.round(q[0] * CS), Y: Math.round(q[1] * CS) }))), CL.JoinType.jtRound, CL.EndType.etOpenRound);
      const sol = new CL.Paths();
      co.Execute(sol, (w / 2) * CS);
      return P2.sanitize(P2.fromC(sol));
    },
    minkowski(a, b) {
      const A = P2.toC(a), B = P2.toC(b), terms = [];
      for (const pa of A) for (const pb of B) {
        for (const t of CL.Clipper.MinkowskiSum(pa, pb, true)) terms.push(t);
        terms.push(pb.map((q) => ({ X: q.X + pa[0].X, Y: q.Y + pa[0].Y })));
        terms.push(pa.map((q) => ({ X: q.X + pb[0].X, Y: q.Y + pb[0].Y })));
      }
      // MinkowskiSum devolve quadriláteros com orientação variada: une por "não-zero" com orientação corrigida
      const fixed = terms.map((t) => (CL.Clipper.Area(t) < 0 ? t.slice().reverse() : t));
      return P2.fromC(P2.exec(CL.ClipType.ctUnion, fixed, null, NZ));
    },
    transform(paths, m) {
      const out = paths.map((p) => p.map((q) => [m[0][0] * q[0] + m[0][1] * q[1] + m[0][3], m[1][0] * q[0] + m[1][1] * q[1] + m[1][3]]));
      if (m[0][0] * m[1][1] - m[0][1] * m[1][0] < 0) for (const p of out) p.reverse();
      return out;
    },
    bounds(paths) {
      const mn = [Infinity, Infinity, 0], mx = [-Infinity, -Infinity, 0];
      for (const p of paths) for (const q of p) { if (q[0] < mn[0]) mn[0] = q[0]; if (q[1] < mn[1]) mn[1] = q[1]; if (q[0] > mx[0]) mx[0] = q[0]; if (q[1] > mx[1]) mx[1] = q[1]; }
      return [mn, mx];
    },
    area(paths) {
      let a = 0;
      for (const p of paths) for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u[0] * v[1] - v[0] * u[1]; }
      return a / 2;
    },
  };

  // envoltória convexa 2D (cadeia monótona), devolve o contorno no sentido anti-horário
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }

  // ───────────────────────────── 3D (Manifold) ─────────────────────────────
  // Sólidos 3D são objetos Manifold (WebAssembly). Toda operação devolve uma malha fechada,
  // pronta para o fatiador. A memória do WebAssembly não é liberada sozinha: cada sólido criado
  // numa renderização vai para a "arena" e tudo é liberado quando o resultado não é mais usado.
  let MF = null;
  let ARENA = null;
  function setManifold(wasm) { MF = { Manifold: wasm.Manifold, CrossSection: wasm.CrossSection, Mesh: wasm.Mesh }; }
  function need3D() { if (!MF) throw new Error('o motor 3D (Manifold) ainda não carregou'); }
  function keep(x) { if (ARENA) ARENA.push(x); return x; }
  function freeAll(list) { for (const x of list) { try { x.delete(); } catch (e) { /* já liberado */ } } list.length = 0; }
  // contornos 2D (Clipper) → CrossSection temporária do Manifold
  function withCS(paths, fn) {
    need3D();
    const cs = new MF.CrossSection(paths, 'NonZero');
    try { return fn(cs); } finally { cs.delete(); }
  }
  function csToPaths(cs) {
    try { return P2.sanitize(cs.toPolygons().map((p) => p.map((q) => [q[0], q[1]]))); } finally { cs.delete(); }
  }
  // faces (listas de pontos no sentido anti-horário visto de fora) → sólido; vértices iguais são compartilhados
  function solidFromFaces(faces) {
    need3D();
    const ids = new Map(), pos = [], tri = [];
    const vid = (p) => {
      const k = p[0] + ',' + p[1] + ',' + p[2];
      let i = ids.get(k);
      if (i === undefined) { i = pos.length / 3; ids.set(k, i); pos.push(p[0], p[1], p[2]); }
      return i;
    };
    for (const f of faces) {
      const idx = [];
      for (const p of f) { const i = vid(p); if (idx[idx.length - 1] !== i) idx.push(i); }
      if (idx.length > 1 && idx[0] === idx[idx.length - 1]) idx.pop();
      if (idx.length < 3) continue;
      if (idx.length === 3) { tri.push(idx[0], idx[1], idx[2]); continue; }
      const pts = idx.map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      let p2;
      if (az >= ax && az >= ay) p2 = pts.map((q) => (nz >= 0 ? [q[0], q[1]] : [q[1], q[0]]));
      else if (ax >= ay) p2 = pts.map((q) => (nx >= 0 ? [q[1], q[2]] : [q[2], q[1]]));
      else p2 = pts.map((q) => (ny >= 0 ? [q[2], q[0]] : [q[0], q[2]]));
      for (const t of earclip(p2)) tri.push(idx[t[0]], idx[t[1]], idx[t[2]]);
    }
    const mesh = new MF.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) });
    mesh.merge();
    return keep(new MF.Manifold(mesh));
  }
  const S3 = {
    union(list) { need3D(); return list.length === 1 ? list[0] : keep(MF.Manifold.union(list)); },
    difference(base, tools) { need3D(); return tools.length ? keep(MF.Manifold.difference([base].concat(tools))) : base; },
    intersection(list) { need3D(); return list.length === 1 ? list[0] : keep(MF.Manifold.intersection(list)); },
    transform(g, m) { return keep(g.transform(toColMajor(m))); },
    bounds(g) {
      if (g.isEmpty()) return [[0, 0, 0], [0, 0, 0]];
      const b = g.boundingBox();
      return [[b.min[0], b.min[1], b.min[2]], [b.max[0], b.max[1], b.max[2]]];
    },
  };

  class ScadError extends Error {
    constructor(msg, line) { super(msg); this.line = line; }
  }

  // ───────────────────────────── Lexer ─────────────────────────────
  const KEYWORDS = new Set(['module', 'function', 'if', 'else', 'for', 'let', 'each', 'true', 'false', 'undef']);
  const TWO_CHAR = new Set(['<=', '>=', '==', '!=', '&&', '||']);
  const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '^', '!', '<', '>', '=', '?', ':', ',', ';', '(', ')', '[', ']', '{', '}', '.', '#']);

  function lex(src) {
    const toks = [];
    let i = 0, line = 1;
    const n = src.length;
    const isDigit = (c) => c >= '0' && c <= '9';
    const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
    const isId = (c) => isIdStart(c) || isDigit(c);
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const sl = line; i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        if (i >= n) throw new ScadError('Comentário /* ... */ sem fechamento', sl);
        i += 2; continue;
      }
      const s = i, ln = line;
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
        while (i < n && isDigit(src[i])) i++;
        if (src[i] === '.' && src[i + 1] !== '.') { i++; while (i < n && isDigit(src[i])) i++; }
        if (src[i] === 'e' || src[i] === 'E') {
          let j = i + 1;
          if (src[j] === '+' || src[j] === '-') j++;
          if (isDigit(src[j] || '')) { i = j; while (i < n && isDigit(src[i])) i++; }
        }
        toks.push({ t: 'num', v: parseFloat(src.slice(s, i)), s, e: i, line: ln });
        continue;
      }
      if (isIdStart(c)) {
        while (i < n && isId(src[i])) i++;
        const word = src.slice(s, i);
        if (word === 'include' || word === 'use') {
          let j = i; while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
          if (src[j] === '<') {
            const close = src.indexOf('>', j);
            if (close < 0) throw new ScadError(`${word} <...> sem fechamento`, ln);
            toks.push({ t: 'include', v: src.slice(j + 1, close), kind: word, s, e: close + 1, line: ln });
            i = close + 1; continue;
          }
        }
        toks.push({ t: KEYWORDS.has(word) ? 'kw' : 'id', v: word, s, e: i, line: ln });
        continue;
      }
      if (c === '"') {
        i++;
        let out = '';
        while (i < n && src[i] !== '"') {
          let ch = src[i];
          if (ch === '\n') line++;
          if (ch === '\\') {
            const nx = src[i + 1];
            i += 2;
            if (nx === 'n') out += '\n';
            else if (nx === 't') out += '\t';
            else if (nx === 'r') out += '\r';
            else if (nx === '"') out += '"';
            else if (nx === '\\') out += '\\';
            else if (nx === 'x') { out += String.fromCharCode(parseInt(src.substr(i, 2), 16)); i += 2; }
            else if (nx === 'u') { out += String.fromCodePoint(parseInt(src.substr(i, 4), 16)); i += 4; }
            else if (nx === 'U') { out += String.fromCodePoint(parseInt(src.substr(i, 6), 16)); i += 6; }
            else out += nx || '';
            continue;
          }
          out += ch; i++;
        }
        if (i >= n) throw new ScadError('Texto entre aspas sem fechamento', ln);
        i++;
        toks.push({ t: 'str', v: out, s, e: i, line: ln });
        continue;
      }
      const two = src.substr(i, 2);
      if (TWO_CHAR.has(two)) { i += 2; toks.push({ t: 'op', v: two, s, e: i, line: ln }); continue; }
      if (ONE_CHAR.has(c)) { i++; toks.push({ t: 'op', v: c, s, e: i, line: ln }); continue; }
      throw new ScadError(`Caractere inesperado '${c}'`, ln);
    }
    toks.push({ t: 'eof', v: '', s: n, e: n, line });
    return toks;
  }

  // ───────────────────────────── Parser ─────────────────────────────
  class Parser {
    constructor(src) { this.src = src; this.toks = lex(src); this.p = 0; }
    peek(o = 0) { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
    next() { return this.toks[this.p++]; }
    isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
    isKw(v, o = 0) { const t = this.peek(o); return t.t === 'kw' && t.v === v; }
    err(msg, t) {
      t = t || this.peek();
      const near = t.t === 'eof' ? ' (fim do arquivo)' : ` perto de '${t.t === 'str' ? '"' + t.v + '"' : t.v}'`;
      throw new ScadError(`Erro de sintaxe: ${msg}${near}`, t.line);
    }
    expectOp(v) { const t = this.peek(); if (!(t.t === 'op' && t.v === v)) this.err(`esperado '${v}'`, t); return this.next(); }
    expectId() { const t = this.peek(); if (t.t !== 'id') this.err('esperado um nome', t); return this.next(); }

    parseProgram() {
      const body = [];
      while (this.peek().t !== 'eof') { const s = this.parseStatement(); if (s) body.push(s); }
      return { type: 'block', body, line: 1 };
    }

    parseStatement() {
      const t = this.peek();
      if (t.t === 'op') {
        if (t.v === ';') { this.next(); return null; }
        if (t.v === '{') {
          this.next();
          const body = [];
          while (!this.isOp('}')) {
            if (this.peek().t === 'eof') this.err("faltou fechar '}' aberto na linha " + t.line);
            const s = this.parseStatement(); if (s) body.push(s);
          }
          this.next();
          return { type: 'block', body, line: t.line, s: t.s };
        }
        if (t.v === '!' || t.v === '#' || t.v === '%' || t.v === '*') {
          this.next();
          const st = this.parseStatement();
          if (!st) return null;
          st.mod = (st.mod || '') + t.v;
          return st;
        }
        this.err('instrução inesperada', t);
      }
      if (t.t === 'include') { this.next(); return { type: 'include', path: t.v, kind: t.kind, line: t.line }; }
      if (t.t === 'kw') {
        if (t.v === 'module') {
          this.next();
          const name = this.expectId().v;
          this.expectOp('(');
          const params = this.parseParams();
          this.expectOp(')');
          const body = this.parseStatement();
          return { type: 'moddef', name, params, body, line: t.line };
        }
        if (t.v === 'function') {
          this.next();
          const name = this.expectId().v;
          this.expectOp('(');
          const params = this.parseParams();
          this.expectOp(')');
          this.expectOp('=');
          const expr = this.parseExpr();
          this.expectOp(';');
          return { type: 'fundef', name, params, expr, line: t.line };
        }
        if (t.v === 'if') {
          this.next(); this.expectOp('(');
          const cond = this.parseExpr();
          this.expectOp(')');
          const then = this.parseStatement();
          let els = null;
          if (this.isKw('else')) { this.next(); els = this.parseStatement(); }
          return { type: 'if', cond, then, els, line: t.line };
        }
        if (t.v === 'for') {
          this.next(); this.expectOp('(');
          const assigns = this.parseAssignList();
          this.expectOp(')');
          const body = this.parseStatement();
          return { type: 'for', inter: false, assigns, body, line: t.line };
        }
        if (t.v === 'let') {
          this.next(); this.expectOp('(');
          const assigns = this.parseAssignList();
          this.expectOp(')');
          const body = this.parseStatement();
          return { type: 'let', assigns, body, line: t.line };
        }
        this.err('palavra-chave fora de lugar', t);
      }
      if (t.t === 'id') {
        if (this.isOp('=', 1)) {
          this.next(); this.next();
          const expr = this.parseExpr();
          const end = this.expectOp(';');
          return { type: 'assign', name: t.v, expr, line: t.line, s: t.s, e: end.e };
        }
        if (t.v === 'intersection_for' && this.isOp('(', 1)) {
          this.next(); this.expectOp('(');
          const assigns = this.parseAssignList();
          this.expectOp(')');
          const body = this.parseStatement();
          return { type: 'for', inter: true, assigns, body, line: t.line };
        }
        this.next();
        if (!this.isOp('(')) this.err(`esperado '(' depois de '${t.v}' (ou '=' para criar uma variável)`);
        this.next();
        const args = this.parseArgs();
        this.expectOp(')');
        let child = null;
        if (this.isOp(';')) this.next();
        else child = this.parseStatement();
        return { type: 'inst', name: t.v, args, child, line: t.line, s: t.s };
      }
      this.err('instrução inesperada', t);
    }

    parseParams() {
      const params = [];
      while (!this.isOp(')')) {
        const name = this.expectId().v;
        let def = null;
        if (this.isOp('=')) { this.next(); def = this.parseExpr(); }
        params.push({ name, def });
        if (this.isOp(',')) this.next(); else break;
      }
      return params;
    }

    parseArgs() {
      const args = [];
      while (!this.isOp(')')) {
        if (this.peek().t === 'id' && this.isOp('=', 1)) {
          const name = this.next().v; this.next();
          args.push({ name, expr: this.parseExpr() });
        } else args.push({ name: null, expr: this.parseExpr() });
        if (this.isOp(',')) this.next(); else break;
      }
      return args;
    }

    parseAssignList() {
      const list = [];
      while (!this.isOp(')') && !this.isOp(';')) {
        const name = this.expectId().v;
        let expr = null;
        if (this.isOp('=')) { this.next(); expr = this.parseExpr(); }
        list.push({ name, expr });
        if (this.isOp(',')) this.next(); else break;
      }
      return list;
    }

    // ── expressions ──
    parseExpr() {
      const t = this.peek();
      if (t.t === 'kw' && t.v === 'let') {
        this.next(); this.expectOp('(');
        const assigns = this.parseAssignList();
        this.expectOp(')');
        return { type: 'let', assigns, body: this.parseExpr(), line: t.line };
      }
      if (t.t === 'kw' && t.v === 'function') {
        this.next(); this.expectOp('(');
        const params = this.parseParams();
        this.expectOp(')');
        return { type: 'funclit', params, body: this.parseExpr(), line: t.line };
      }
      if (t.t === 'id' && (t.v === 'assert' || t.v === 'echo') && this.isOp('(', 1)) {
        this.next(); this.next();
        const args = this.parseArgs();
        this.expectOp(')');
        let body = null;
        const nx = this.peek();
        if (!(nx.t === 'eof' || (nx.t === 'op' && [';', ',', ')', ']', ':', '}'].includes(nx.v)))) body = this.parseExpr();
        return { type: t.v === 'assert' ? 'assertE' : 'echoE', args, body, line: t.line };
      }
      const cond = this.parseOr();
      if (this.isOp('?')) {
        this.next();
        const a = this.parseExpr();
        this.expectOp(':');
        const b = this.parseExpr();
        return { type: 'tern', cond, a, b, line: t.line };
      }
      return cond;
    }
    binLevel(ops, sub) {
      let left = sub();
      for (;;) {
        const t = this.peek();
        if (t.t === 'op' && ops.includes(t.v)) {
          this.next();
          const right = sub();
          left = { type: 'bin', op: t.v, a: left, b: right, line: t.line, s: left.s, e: right.e };
        } else return left;
      }
    }
    parseOr() { return this.binLevel(['||'], () => this.parseAnd()); }
    parseAnd() { return this.binLevel(['&&'], () => this.parseEq()); }
    parseEq() { return this.binLevel(['==', '!='], () => this.parseRel()); }
    parseRel() { return this.binLevel(['<', '<=', '>', '>='], () => this.parseAdd()); }
    parseAdd() { return this.binLevel(['+', '-'], () => this.parseMul()); }
    parseMul() { return this.binLevel(['*', '/', '%'], () => this.parseUnary()); }
    parseUnary() {
      const t = this.peek();
      if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
        this.next();
        const a = this.parseUnary();
        return { type: 'un', op: t.v, a, line: t.line, s: t.s, e: a.e };
      }
      return this.parsePow();
    }
    parsePow() {
      const base = this.parsePostfix();
      if (this.isOp('^')) {
        const t = this.next();
        const ex = this.parseUnary();
        return { type: 'bin', op: '^', a: base, b: ex, line: t.line, s: base.s, e: ex.e };
      }
      return base;
    }
    parsePostfix() {
      let e = this.parsePrimary();
      for (;;) {
        const t = this.peek();
        if (t.t !== 'op') return e;
        if (t.v === '(') {
          this.next();
          const args = this.parseArgs();
          const end = this.expectOp(')');
          e = e.type === 'var'
            ? { type: 'call', name: e.name, args, line: t.line, s: e.s, e: end.e }
            : { type: 'callv', fn: e, args, line: t.line, s: e.s, e: end.e };
        } else if (t.v === '[') {
          this.next();
          const idx = this.parseExpr();
          const end = this.expectOp(']');
          e = { type: 'index', a: e, i: idx, line: t.line, s: e.s, e: end.e };
        } else if (t.v === '.') {
          this.next();
          const id = this.expectId();
          e = { type: 'member', a: e, m: id.v, line: t.line, s: e.s, e: id.e };
        } else return e;
      }
    }
    parsePrimary() {
      const t = this.peek();
      if (t.t === 'num' || t.t === 'str') { this.next(); return { type: 'lit', v: t.v, line: t.line, s: t.s, e: t.e }; }
      if (t.t === 'kw') {
        if (t.v === 'true' || t.v === 'false') { this.next(); return { type: 'lit', v: t.v === 'true', line: t.line, s: t.s, e: t.e }; }
        if (t.v === 'undef') { this.next(); return { type: 'lit', v: undefined, line: t.line, s: t.s, e: t.e }; }
        if (t.v === 'let' || t.v === 'function') return this.parseExpr();
      }
      if (t.t === 'id') {
        if ((t.v === 'assert' || t.v === 'echo') && this.isOp('(', 1)) return this.parseExpr();
        this.next();
        return { type: 'var', name: t.v, line: t.line, s: t.s, e: t.e };
      }
      if (t.t === 'op' && t.v === '(') {
        this.next();
        const e = this.parseExpr();
        this.expectOp(')');
        return e;
      }
      if (t.t === 'op' && t.v === '[') return this.parseVector();
      this.err('expressão esperada', t);
    }
    parseVector() {
      const start = this.next();
      if (this.isOp(']')) { const end = this.next(); return { type: 'vec', elems: [], line: start.line, s: start.s, e: end.e }; }
      const first = this.parseListElem();
      if (this.isOp(':') && !first.type.startsWith('lc_')) {
        this.next();
        const second = this.parseExpr();
        let step = null, last = second;
        if (this.isOp(':')) { this.next(); step = second; last = this.parseExpr(); }
        const end = this.expectOp(']');
        return { type: 'range', a: first, st: step, b: last, line: start.line, s: start.s, e: end.e };
      }
      const elems = [first];
      while (this.isOp(',')) {
        this.next();
        if (this.isOp(']')) break;
        elems.push(this.parseListElem());
      }
      const end = this.expectOp(']');
      return { type: 'vec', elems, line: start.line, s: start.s, e: end.e };
    }
    parseListElem() {
      const t = this.peek();
      if (t.t === 'kw' && t.v === 'for') {
        this.next(); this.expectOp('(');
        const assigns = this.parseAssignList();
        if (this.isOp(';')) {
          this.next();
          const cond = this.parseExpr();
          this.expectOp(';');
          const update = this.parseAssignList();
          this.expectOp(')');
          return { type: 'lc_cfor', init: assigns, cond, update, body: this.parseListElem(), line: t.line };
        }
        this.expectOp(')');
        return { type: 'lc_for', assigns, body: this.parseListElem(), line: t.line };
      }
      if (t.t === 'kw' && t.v === 'if') {
        this.next(); this.expectOp('(');
        const cond = this.parseExpr();
        this.expectOp(')');
        const then = this.parseListElem();
        let els = null;
        if (this.isKw('else')) { this.next(); els = this.parseListElem(); }
        return { type: 'lc_if', cond, then, els, line: t.line };
      }
      if (t.t === 'kw' && t.v === 'let') {
        this.next(); this.expectOp('(');
        const assigns = this.parseAssignList();
        this.expectOp(')');
        return { type: 'lc_let', assigns, body: this.parseListElem(), line: t.line };
      }
      if (t.t === 'kw' && t.v === 'each') {
        this.next();
        return { type: 'lc_each', body: this.parseListElem(), line: t.line };
      }
      if (t.t === 'op' && t.v === '(' && this.peek(1).t === 'kw' && ['for', 'each', 'if', 'let'].includes(this.peek(1).v)) {
        this.next();
        const e = this.parseListElem();
        this.expectOp(')');
        return e;
      }
      return this.parseExpr();
    }
  }

  function parse(src) { return new Parser(src).parseProgram(); }

  // ───────────────────────────── Values ─────────────────────────────
  const isNum = (v) => typeof v === 'number';
  const isVec = Array.isArray;
  const isRange = (v) => v && typeof v === 'object' && v.__range;
  const isFn = (v) => v && typeof v === 'object' && v.__fn;

  function truthy(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  function fmtNum(n) {
    if (Number.isNaN(n)) return 'nan';
    if (n === Infinity) return 'inf';
    if (n === -Infinity) return '-inf';
    if (n === 0) return '0';
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    const p = parseFloat(n.toPrecision(6));
    const ab = Math.abs(p);
    if (ab >= 1e6 || ab < 1e-4) {
      const [m, e] = p.toExponential().split('e');
      const ei = parseInt(e, 10);
      return String(parseFloat(parseFloat(m).toPrecision(6))) + 'e' + (ei < 0 ? '-' : '+') + String(Math.abs(ei)).padStart(2, '0');
    }
    return String(p);
  }

  function fmt(v, quote) {
    if (v === undefined || v === null) return 'undef';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'string') return quote ? JSON.stringify(v) : v;
    if (Array.isArray(v)) return '[' + v.map((x) => fmt(x, true)).join(', ') + ']';
    if (isRange(v)) return `[${fmtNum(v.a)} : ${fmtNum(v.s)} : ${fmtNum(v.b)}]`;
    if (isFn(v)) return 'function(' + v.params.map((p) => p.name).join(', ') + ')';
    return String(v);
  }

  function equal(a, b) {
    if (isVec(a) && isVec(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false;
      return true;
    }
    if (isRange(a) && isRange(b)) return a.a === b.a && a.s === b.s && a.b === b.b;
    return a === b;
  }

  const isNumVec = (v) => isVec(v) && v.every(isNum);
  const isMatrix = (v) => isVec(v) && v.length > 0 && v.every(isNumVec);

  function add(a, b, sign) {
    if (isNum(a) && isNum(b)) return sign > 0 ? a + b : a - b;
    if (isVec(a) && isVec(b)) {
      const n = Math.min(a.length, b.length), out = new Array(n);
      for (let i = 0; i < n; i++) { const r = add(a[i], b[i], sign); if (r === undefined) return undefined; out[i] = r; }
      return out;
    }
    return undefined;
  }
  function neg(a) {
    if (isNum(a)) return -a;
    if (isVec(a)) { const out = a.map(neg); return out.some((x) => x === undefined) ? undefined : out; }
    return undefined;
  }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function mul(a, b) {
    if (isNum(a) && isNum(b)) return a * b;
    if (isNum(a) && isVec(b)) return scaleVec(b, a);
    if (isVec(a) && isNum(b)) return scaleVec(a, b);
    if (isVec(a) && isVec(b)) {
      if (isNumVec(a) && isNumVec(b)) return a.length === b.length ? dot(a, b) : undefined;
      if (isMatrix(a) && isNumVec(b)) return a.every((r) => r.length === b.length) ? a.map((r) => dot(r, b)) : undefined;
      if (isNumVec(a) && isMatrix(b)) {
        if (b.length !== a.length) return undefined;
        const cols = b[0].length, out = [];
        for (let j = 0; j < cols; j++) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i][j]; out.push(s); }
        return out;
      }
      if (isMatrix(a) && isMatrix(b)) {
        if (a[0].length !== b.length) return undefined;
        return a.map((r) => { const out = []; for (let j = 0; j < b[0].length; j++) { let s = 0; for (let k = 0; k < r.length; k++) s += r[k] * b[k][j]; out.push(s); } return out; });
      }
    }
    return undefined;
  }
  function scaleVec(v, k) {
    const out = v.map((x) => (isNum(x) ? x * k : isVec(x) ? scaleVec(x, k) : undefined));
    return out.some((x) => x === undefined) ? undefined : out;
  }
  function divide(a, b) {
    if (isNum(a) && isNum(b)) return a / b;
    if (isVec(a) && isNum(b)) return scaleVec(a, 1 / b);
    if (isNum(a) && isVec(b)) { const out = b.map((x) => (isNum(x) ? a / x : undefined)); return out.some((x) => x === undefined) ? undefined : out; }
    return undefined;
  }
  function compare(op, a, b) {
    if ((isNum(a) && isNum(b)) || (typeof a === 'string' && typeof b === 'string')) {
      switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; }
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') return compare(op, +a, +b);
    return undefined;
  }

  // iterate a value as OpenSCAD's for() does
  function iterValues(v, ctx, line) {
    if (isRange(v)) {
      const out = [];
      let { a, s, b } = v;
      if (s === 0 || Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(s)) return out;
      if ((s > 0 && a > b) || (s < 0 && a < b)) return out;
      const count = Math.floor((b - a) / s + 1e-9) + 1;
      if (count > 2000000) throw new ScadError('Intervalo grande demais (mais de 2 milhões de passos)', line);
      for (let k = 0; k < count; k++) out.push(a + k * s);
      return out;
    }
    if (isVec(v)) return v;
    if (typeof v === 'string') return Array.from(v);
    if (v === undefined) return [];
    return [v];
  }

  // ───────────────────────────── Scope ─────────────────────────────
  const NOTFOUND = Symbol('notfound');
  class Scope {
    constructor(lex, dyn) { this.vars = new Map(); this.mods = null; this.funcs = null; this.lex = lex; this.dyn = dyn; this.childInfo = null; }
    get(name) {
      if (name[0] === '$') {
        for (let s = this; s; s = s.dyn) if (s.vars.has(name)) return s.vars.get(name);
        return NOTFOUND;
      }
      for (let s = this; s; s = s.lex) if (s.vars.has(name)) return s.vars.get(name);
      return NOTFOUND;
    }
    findMod(name) { for (let s = this; s; s = s.lex) if (s.mods && s.mods.has(name)) return s.mods.get(name); return null; }
    findFunc(name) { for (let s = this; s; s = s.lex) if (s.funcs && s.funcs.has(name)) return s.funcs.get(name); return null; }
    findChildren() { for (let s = this; s; s = s.lex) if (s.childInfo) return s.childInfo; return null; }
    defMod(name, d) { (this.mods || (this.mods = new Map())).set(name, d); }
    defFunc(name, d) { (this.funcs || (this.funcs = new Map())).set(name, d); }
  }

  // ───────────────────────────── Colors ─────────────────────────────
  const NAMED_COLORS = {
    red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', orange: 'ffa500', purple: '800080', pink: 'ffc0cb',
    white: 'ffffff', black: '000000', gray: '808080', grey: '808080', brown: 'a52a2a', cyan: '00ffff', magenta: 'ff00ff',
    lime: '00ff00', navy: '000080', teal: '008080', olive: '808000', maroon: '800000', silver: 'c0c0c0', gold: 'ffd700',
    violet: 'ee82ee', indigo: '4b0082', coral: 'ff7f50', salmon: 'fa8072', tomato: 'ff6347', crimson: 'dc143c',
    skyblue: '87ceeb', steelblue: '4682b4', royalblue: '4169e1', dodgerblue: '1e90ff', lightblue: 'add8e6', darkblue: '00008b',
    lightgreen: '90ee90', darkgreen: '006400', forestgreen: '228b22', seagreen: '2e8b57', limegreen: '32cd32',
    khaki: 'f0e68c', tan: 'd2b48c', chocolate: 'd2691e', sienna: 'a0522d', beige: 'f5f5dc', ivory: 'fffff0',
    lightgray: 'd3d3d3', lightgrey: 'd3d3d3', darkgray: 'a9a9a9', darkgrey: 'a9a9a9', dimgray: '696969', slategray: '708090',
    turquoise: '40e0d0', aqua: '00ffff', fuchsia: 'ff00ff', orchid: 'da70d6', plum: 'dda0dd', lavender: 'e6e6fa',
    hotpink: 'ff69b4', deeppink: 'ff1493', firebrick: 'b22222', darkred: '8b0000', darkorange: 'ff8c00', goldenrod: 'daa520',
    // nomes em português
    vermelho: 'e53935', verde: '43a047', azul: '1e88e5', amarelo: 'fdd835', laranja: 'fb8c00', roxo: '8e24aa', rosa: 'ec407a',
    branco: 'ffffff', preto: '212121', cinza: '9e9e9e', marrom: '795548', dourado: 'ffd700', prata: 'c0c0c0', bege: 'f5f5dc', vinho: '7b1f3a',
  };
  let colorCanvas = null;
  function parseColor(c, alpha) {
    let rgba = null;
    if (isVec(c)) {
      rgba = [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c.length > 3 ? c[3] : 1];
    } else if (typeof c === 'string') {
      let s = c.trim().toLowerCase();
      if (NAMED_COLORS[s]) s = '#' + NAMED_COLORS[s];
      if (s[0] !== '#' && !s.startsWith('rgb')) {
        try {
          if (!colorCanvas) {
            if (typeof document !== 'undefined') colorCanvas = document.createElement('canvas').getContext('2d');
            else if (typeof OffscreenCanvas !== 'undefined') colorCanvas = new OffscreenCanvas(1, 1).getContext('2d');
          }
          colorCanvas.fillStyle = '#010203';
          colorCanvas.fillStyle = s;
          if (colorCanvas.fillStyle !== '#010203' || s === '#010203') s = colorCanvas.fillStyle;
        } catch (e) { /* ignore */ }
      }
      if (s[0] === '#') {
        let h = s.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
        if (h.length === 6 || h.length === 8) {
          rgba = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
        }
      } else if (s.startsWith('rgb')) {
        const m = s.match(/[\d.]+/g);
        if (m) rgba = [m[0] / 255, m[1] / 255, m[2] / 255, m[3] !== undefined ? +m[3] : 1];
      }
    }
    if (!rgba) return null;
    if (isNum(alpha)) rgba[3] = alpha;
    return rgba.map((x) => (isNum(x) ? Math.max(0, Math.min(1, x)) : 1));
  }

  // ───────────────────────────── Matrices (row-major 4x4) ─────────────────────────────
  const I4 = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  function mm(a, b) {
    const r = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i][k] * b[k][j]; r[i][j] = s; }
    return r;
  }
  function toColMajor(m) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = m[r][c];
    return out;
  }
  function cosd(a) { const m = ((a % 360) + 360) % 360; if (m === 90 || m === 270) return 0; if (m === 0) return 1; if (m === 180) return -1; return Math.cos(a * DEG); }
  function sind(a) { const m = ((a % 360) + 360) % 360; if (m === 0 || m === 180) return 0; if (m === 90) return 1; if (m === 270) return -1; return Math.sin(a * DEG); }
  const Rx = (a) => { const c = cosd(a), s = sind(a); return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]]; };
  const Ry = (a) => { const c = cosd(a), s = sind(a); return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]]; };
  const Rz = (a) => { const c = cosd(a), s = sind(a); return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; };
  const Tm = (x, y, z) => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
  const Sm = (x, y, z) => [[x, 0, 0, 0], [0, y, 0, 0], [0, 0, z, 0], [0, 0, 0, 1]];
  function Raxis(a, v) {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) return I4();
    const [x, y, z] = [v[0] / len, v[1] / len, v[2] / len];
    const c = cosd(a), s = sind(a), t = 1 - c;
    return [
      [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0],
      [t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0],
      [0, 0, 0, 1],
    ];
  }

  // ───────────────────────────── Geometry helpers ─────────────────────────────
  function fragments(r, sc) {
    const fn = num(sc.get('$fn'), 0), fs = num(sc.get('$fs'), 2), fa = num(sc.get('$fa'), 12);
    if (r < 1e-8) return 3;
    if (fn > 0) return fn >= 3 ? Math.floor(fn) : 3;
    return Math.ceil(Math.max(Math.min(360 / Math.max(fa, 0.01), (r * 2 * Math.PI) / Math.max(fs, 0.01)), 5));
  }
  function num(v, d) { return isNum(v) && !Number.isNaN(v) ? v : d; }

  function circlePts(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (360 * i) / n; pts.push([r * cosd(a), r * sind(a)]); }
    return pts;
  }
  function signedArea2(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  // um contorno simples (já sem auto-interseções) → forma 2D orientada
  function poly2(pts) {
    const clean = pts.map((p) => [p[0], p[1]]);
    if (clean.length < 3 || Math.abs(signedArea2(clean)) < 1e-12) return null;
    if (signedArea2(clean) < 0) clean.reverse();
    return [clean];
  }

  // ear clipping triangulation of a 2D polygon (indices); assumes simple polygon
  function earclip(pts) {
    const n = pts.length;
    if (n < 3) return [];
    const idx = [];
    const ccw = signedArea2(pts) > 0;
    for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);
    const tris = [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let guard = 0;
    while (idx.length > 3 && guard++ < n * n) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if (cross(a, b, c) <= 1e-14) continue;
        let inside = false;
        for (const j of idx) {
          if (j === ia || j === ib || j === ic) continue;
          const p = pts[j];
          if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) { inside = true; break; }
        }
        if (inside) continue;
        tris.push([ia, ib, ic]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    return tris;
  }

  function isEmptyGeom(o) {
    if (o.dim === 3) return o.g.isEmpty();
    return o.g.length === 0;
  }
  function objBounds(o) {
    return o.dim === 2 ? P2.bounds(o.g) : S3.bounds(o.g);
  }

  function mkObj(g, dim, line) { return { g, dim, color: null, line }; }
  const EMPTY = () => ({ solids: [], ghosts: [] });
  function merge(lists) {
    const out = EMPTY();
    for (const l of lists) { if (!l) continue; for (const s of l.solids) out.solids.push(s); for (const g of l.ghosts) out.ghosts.push(g); }
    return out;
  }
  function mapList(list, fn) {
    return { solids: list.solids.map((o) => ({ ...o, g: fn(o.g, o.dim) })), ghosts: list.ghosts.map((o) => ({ ...o, g: fn(o.g, o.dim) })) };
  }
  function applyMatrix(list, m) {
    return mapList(list, (g, dim) => (dim === 2 ? P2.transform(g, m) : S3.transform(g, m)));
  }

  // union a set of objects of a given dim into one object (keeps first color / line)
  function unionObjs(objs, dim) {
    const sel = objs.filter((o) => o.dim === dim);
    if (!sel.length) return null;
    let g;
    if (dim === 2) g = sel.length === 1 ? sel[0].g : P2.union(sel.map((o) => o.g));
    else g = S3.union(sel.map((o) => o.g));
    return { g, dim, color: sel[0].color, line: sel[0].line };
  }
  function mainDim(objs) { return objs.some((o) => o.dim === 3) ? 3 : objs.length ? 2 : 0; }

  // ───────────────────────────── Interpreter ─────────────────────────────
  class Interp {
    constructor(opts) {
      this.opts = opts || {};
      this.echoes = [];
      this.warnings = [];
      this.root = null;
      this.depth = 0;
      this.ops = 0;
      this.start = Date.now();
      this.timeLimit = this.opts.timeLimit || 60000;
      this.warnSet = new Set();
      this.fontsWanted = new Set();
      this.libs = this.opts.libs || {};
      this.libAst = new Map();
      this.incStack = [];
    }
    warn(msg, line) {
      const key = msg + '@' + line;
      if (this.warnSet.has(key)) return;
      this.warnSet.add(key);
      if (this.warnings.length < 200) this.warnings.push({ msg, line });
    }
    tick(line) {
      if ((++this.ops & 1023) === 0 && Date.now() - this.start > this.timeLimit) throw new ScadError('Tempo limite excedido (o modelo é pesado demais ou tem um laço infinito)', line);
    }

    // ── expressions ──
    ev(n, sc) {
      switch (n.type) {
        case 'lit': return n.v;
        case 'var': {
          const v = sc.get(n.name);
          if (v !== NOTFOUND) return v;
          if (n.name === 'PI') return Math.PI;
          if (n.name[0] === '$') return undefined;
          this.warn(`Variável desconhecida '${n.name}'`, n.line);
          return undefined;
        }
        case 'un': {
          const a = this.ev(n.a, sc);
          if (n.op === '!') return !truthy(a);
          if (n.op === '-') return neg(a);
          return isNum(a) || isVec(a) ? a : undefined;
        }
        case 'bin': {
          if (n.op === '&&') return truthy(this.ev(n.a, sc)) && truthy(this.ev(n.b, sc));
          if (n.op === '||') return truthy(this.ev(n.a, sc)) || truthy(this.ev(n.b, sc));
          const a = this.ev(n.a, sc), b = this.ev(n.b, sc);
          switch (n.op) {
            case '+': return add(a, b, 1);
            case '-': return add(a, b, -1);
            case '*': return mul(a, b);
            case '/': return divide(a, b);
            case '%': return isNum(a) && isNum(b) ? a % b : undefined;
            case '^': return isNum(a) && isNum(b) ? Math.pow(a, b) : undefined;
            case '==': return equal(a, b);
            case '!=': return !equal(a, b);
            default: return compare(n.op, a, b);
          }
        }
        case 'tern': return truthy(this.ev(n.cond, sc)) ? this.ev(n.a, sc) : this.ev(n.b, sc);
        case 'vec': {
          const out = [];
          for (const el of n.elems) this.evElem(el, sc, out);
          return out;
        }
        case 'range': {
          const a = this.ev(n.a, sc), b = this.ev(n.b, sc), s = n.st ? this.ev(n.st, sc) : 1;
          if (!isNum(a) || !isNum(b) || !isNum(s)) { this.warn('Intervalo [a:b] precisa de números', n.line); return undefined; }
          if (!n.st && a > b) return { __range: true, a: b, s: 1, b: a };
          return { __range: true, a, s, b };
        }
        case 'index': {
          const a = this.ev(n.a, sc), i = this.ev(n.i, sc);
          if (!isNum(i)) return undefined;
          const k = Math.floor(i);
          if (isVec(a) || typeof a === 'string') return k >= 0 && k < a.length ? a[k] : undefined;
          if (isRange(a)) return k === 0 ? a.a : k === 1 ? a.s : k === 2 ? a.b : undefined;
          return undefined;
        }
        case 'member': {
          const a = this.ev(n.a, sc);
          const k = { x: 0, y: 1, z: 2, r: 0, g: 1, b: 2, a: 3 }[n.m];
          if (isVec(a) && k !== undefined) return a[k];
          return undefined;
        }
        case 'let': {
          const s = new Scope(sc, sc);
          for (const as of n.assigns) s.vars.set(as.name, as.expr ? this.ev(as.expr, s) : undefined);
          return this.ev(n.body, s);
        }
        case 'funclit': return { __fn: true, params: n.params, body: n.body, scope: sc };
        case 'assertE': {
          const { pos } = this.evArgs(n.args, sc);
          if (!truthy(pos[0])) throw new ScadError('Assertion falhou' + (pos[1] !== undefined ? ': ' + fmt(pos[1], false) : ''), n.line);
          return n.body ? this.ev(n.body, sc) : undefined;
        }
        case 'echoE': {
          this.echo(n.args, sc);
          return n.body ? this.ev(n.body, sc) : undefined;
        }
        case 'call': return this.callNamed(n, sc);
        case 'callv': {
          const f = this.ev(n.fn, sc);
          if (!isFn(f)) { this.warn('Tentativa de chamar algo que não é função', n.line); return undefined; }
          return this.callFn(f.params, f.body, f.scope, n.args, sc, n.line);
        }
      }
      throw new ScadError('Expressão não suportada: ' + n.type, n.line);
    }

    evElem(el, sc, out) {
      this.tick(el.line);
      switch (el.type) {
        case 'lc_for': {
          this.forEachCombo(el.assigns, sc, el.line, (s) => this.evElem(el.body, s, out));
          return;
        }
        case 'lc_cfor': {
          let s = new Scope(sc, sc);
          for (const a of el.init) s.vars.set(a.name, this.ev(a.expr, s));
          let guard = 0;
          while (truthy(this.ev(el.cond, s))) {
            if (++guard > 1000000) throw new ScadError('Laço for(;;) sem fim', el.line);
            this.evElem(el.body, s, out);
            const ns = new Scope(sc, sc);
            for (const [k, v] of s.vars) ns.vars.set(k, v);
            for (const a of el.update) ns.vars.set(a.name, this.ev(a.expr, s));
            s = ns;
          }
          return;
        }
        case 'lc_if': {
          if (truthy(this.ev(el.cond, sc))) this.evElem(el.then, sc, out);
          else if (el.els) this.evElem(el.els, sc, out);
          return;
        }
        case 'lc_let': {
          const s = new Scope(sc, sc);
          for (const a of el.assigns) s.vars.set(a.name, a.expr ? this.ev(a.expr, s) : undefined);
          this.evElem(el.body, s, out);
          return;
        }
        case 'lc_each': {
          const tmp = [];
          this.evElem(el.body, sc, tmp);
          for (const v of tmp) for (const x of iterValues(v, this, el.line)) out.push(x);
          return;
        }
        default: out.push(this.ev(el, sc));
      }
    }

    forEachCombo(assigns, sc, line, cb) {
      const rec = (i, s) => {
        if (i === assigns.length) { cb(s); return; }
        const a = assigns[i];
        const vals = iterValues(a.expr ? this.ev(a.expr, s) : undefined, this, line);
        for (const v of vals) {
          this.tick(line);
          const ns = new Scope(s, s);
          ns.vars.set(a.name, v);
          rec(i + 1, ns);
        }
      };
      rec(0, sc);
    }

    evArgs(args, sc) {
      const pos = [], named = {};
      for (const a of args) {
        const v = this.ev(a.expr, sc);
        if (a.name) named[a.name] = v; else pos.push(v);
      }
      return { pos, named };
    }

    echo(args, sc) {
      const parts = args.map((a) => {
        const v = this.ev(a.expr, sc);
        return a.name ? `${a.name} = ${fmt(v, true)}` : fmt(v, true);
      });
      const msg = 'ECHO: ' + parts.join(', ');
      if (this.echoes.length < 2000) this.echoes.push({ msg, line: args.length ? args[0].expr.line : null });
    }

    bindParams(params, args, callSc, ns, line) {
      let pi = 0;
      const set = new Set();
      for (const a of args) {
        const v = this.ev(a.expr, callSc);
        if (a.name) {
          if (a.name[0] === '$' || params.some((p) => p.name === a.name)) { ns.vars.set(a.name, v); set.add(a.name); }
          else this.warn(`Parâmetro '${a.name}' não existe`, line);
        } else {
          while (pi < params.length && set.has(params[pi].name)) pi++;
          if (pi < params.length) { ns.vars.set(params[pi].name, v); set.add(params[pi].name); pi++; }
        }
      }
      for (const p of params) if (!set.has(p.name)) ns.vars.set(p.name, p.def ? this.ev(p.def, ns) : undefined);
    }

    callFn(params, body, defScope, args, callSc, line) {
      if (++this.depth > 3000) throw new ScadError('Recursão profunda demais', line);
      try {
        let ns = new Scope(defScope, callSc);
        this.bindParams(params, args, callSc, ns, line);
        // Chamada final (tail call): reaproveita o laço em vez de empilhar, como o OpenSCAD.
        let node = body, sc = ns;
        for (;;) {
          if (node.type === 'tern') { node = truthy(this.ev(node.cond, sc)) ? node.a : node.b; continue; }
          if (node.type === 'let') {
            const s2 = new Scope(sc, sc);
            for (const as of node.assigns) s2.vars.set(as.name, as.expr ? this.ev(as.expr, s2) : undefined);
            sc = s2; node = node.body; continue;
          }
          if (node.type === 'call') {
            let t = sc.findFunc(node.name), tp, tb, ts;
            if (t) { tp = t.params; tb = t.expr; ts = t.scope; }
            else {
              const v = sc.get(node.name);
              if (v !== NOTFOUND && isFn(v)) { tp = v.params; tb = v.body; ts = v.scope; }
            }
            if (tp) {
              this.tick(node.line);
              const n2 = new Scope(ts, sc);
              this.bindParams(tp, node.args, sc, n2, node.line);
              sc = n2; node = tb; continue;
            }
          }
          return this.ev(node, sc);
        }
      } finally { this.depth--; }
    }

    callNamed(n, sc) {
      this.tick(n.line);
      const uf = sc.findFunc(n.name);
      if (uf) return this.callFn(uf.params, uf.expr, uf.scope, n.args, sc, n.line);
      const v = sc.get(n.name);
      if (v !== NOTFOUND && isFn(v)) return this.callFn(v.params, v.body, v.scope, n.args, sc, n.line);
      const bf = BUILTIN_FUNCS[n.name];
      if (bf) {
        const { pos, named } = this.evArgs(n.args, sc);
        return bf(pos, named, this, n.line);
      }
      this.warn(`Função desconhecida '${n.name}'`, n.line);
      return undefined;
    }

    // ── statements ──
    libFor(path, line) {
      const base = String(path).split(/[\\/]/).pop();
      const key = Object.keys(this.libs).find((k) => k.toLowerCase() === base.toLowerCase() || k.toLowerCase() === (base + '.scad').toLowerCase());
      if (!key) { this.warn(`Biblioteca '${base}' não encontrada. Crie ou importe na aba Biblioteca.`, line); return null; }
      if (this.incStack.includes(key)) { this.warn(`Biblioteca '${base}' se inclui em círculo`, line); return null; }
      let ast = this.libAst.get(key);
      if (!ast) {
        try { ast = parse(this.libs[key]); } catch (e) { throw new ScadError(`Erro na biblioteca ${key}: ${e.message}`, line); }
        this.libAst.set(key, ast);
      }
      return { key, ast };
    }
    // troca cada include/use pelo conteúdo da biblioteca
    expandIncludes(stmts, sc) {
      const out = [];
      for (const st of stmts) {
        if (st.type !== 'include') { out.push(st); continue; }
        const lib = this.libFor(st.path, st.line);
        if (!lib) continue;
        this.incStack.push(lib.key);
        try {
          if (st.kind === 'include') out.push(...this.expandIncludes(lib.ast.body, sc));
          else {
            // use: só módulos e funções, cada um enxergando as variáveis da própria biblioteca
            const ls = new Scope(null, null);
            const body = this.expandIncludes(lib.ast.body, ls);
            for (const b of body) {
              if (b.type === 'moddef') { const d = { params: b.params, body: b.body, scope: ls }; ls.defMod(b.name, d); sc.defMod(b.name, d); }
              else if (b.type === 'fundef') { const d = { params: b.params, expr: b.expr, scope: ls }; ls.defFunc(b.name, d); sc.defFunc(b.name, d); }
            }
            for (const b of body) if (b.type === 'assign') ls.vars.set(b.name, this.ev(b.expr, ls));
          }
        } finally { this.incStack.pop(); }
      }
      return out;
    }

    runBlock(stmts, sc) {
      if (stmts.some((s) => s.type === 'include')) stmts = this.expandIncludes(stmts, sc);
      for (const st of stmts) {
        if (st.type === 'moddef') sc.defMod(st.name, { params: st.params, body: st.body, scope: sc });
        else if (st.type === 'fundef') sc.defFunc(st.name, { params: st.params, expr: st.expr, scope: sc });
      }
      const seen = sc === this.top ? new Set() : null;
      for (const st of stmts) {
        if (st.type === 'assign') {
          if (seen) { if (seen.has(st.name)) this.warn(`'${st.name}' foi definida mais de uma vez; vale a última`, st.line); seen.add(st.name); }
          sc.vars.set(st.name, this.ev(st.expr, sc));
        }
      }
      const results = [];
      for (const st of stmts) {
        if (st.type === 'assign' || st.type === 'moddef' || st.type === 'fundef') continue;
        if (st.type === 'include') { this.warn(`${st.kind} <${st.path}> não é suportado aqui (bibliotecas externas)`, st.line); continue; }
        results.push(this.stmt(st, sc));
      }
      return results;
    }

    stmt(st, sc) {
      this.tick(st.line);
      const mod = st.mod || '';
      if (mod.includes('*')) return EMPTY();
      let res = this.stmtInner(st, sc);
      if (!res) res = EMPTY();
      if (mod.includes('%')) {
        res = { solids: [], ghosts: res.ghosts.concat(res.solids.map((o) => ({ ...o, ghost: 'bg' }))) };
      } else if (mod.includes('#')) {
        res = { solids: res.solids, ghosts: res.ghosts.concat(res.solids.map((o) => ({ ...o, ghost: 'hl' }))) };
      }
      if (mod.includes('!')) this.root = res;
      return res;
    }

    stmtInner(st, sc) {
      switch (st.type) {
        case 'block': return merge(this.runBlock(st.body, new Scope(sc, sc)));
        case 'if': {
          if (truthy(this.ev(st.cond, sc))) return st.then ? this.stmt(st.then, new Scope(sc, sc)) : EMPTY();
          return st.els ? this.stmt(st.els, new Scope(sc, sc)) : EMPTY();
        }
        case 'for': {
          const lists = [];
          this.forEachCombo(st.assigns, sc, st.line, (s) => { if (st.body) lists.push(this.stmt(st.body, s)); });
          if (!st.inter) return merge(lists);
          return this.booleanOp('intersection', lists, st.line);
        }
        case 'let': {
          const s = new Scope(sc, sc);
          for (const a of st.assigns) s.vars.set(a.name, a.expr ? this.ev(a.expr, s) : undefined);
          return st.body ? this.stmt(st.body, s) : EMPTY();
        }
        case 'inst': return this.inst(st, sc);
        case 'assign': case 'moddef': case 'fundef': {
          if (st.type === 'assign') { const s = new Scope(sc, sc); s.vars.set(st.name, this.ev(st.expr, s)); }
          return EMPTY();
        }
        case 'include': this.warn(`${st.kind} <${st.path}> não é suportado aqui`, st.line); return EMPTY();
      }
      return EMPTY();
    }

    // evaluate the children of an instantiation, returns an array of lists (one per child statement)
    evalChildren(child, sc) {
      if (!child) return [];
      if (child.type === 'block' && !child.mod) return this.runBlock(child.body, new Scope(sc, sc));
      return [this.stmt(child, sc)];
    }

    inst(st, sc) {
      let name = st.name;
      const um = sc.findMod(name);
      if (um) return this.callModule(um, st, sc);
      if (ALIASES[name] && !sc.findMod(ALIASES[name])) name = ALIASES[name];
      if (name === 'children') return this.children(st, sc);
      if (name === 'echo') {
        this.echo(st.args, sc);
        return merge(this.evalChildren(st.child, sc));
      }
      if (name === 'assert') {
        const { pos, named } = this.evArgs(st.args, sc);
        const cond = 'condition' in named ? named.condition : pos[0];
        const msg = 'message' in named ? named.message : pos[1];
        if (!truthy(cond)) throw new ScadError('Assertion falhou' + (msg !== undefined ? ': ' + fmt(msg, false) : ''), st.line);
        return merge(this.evalChildren(st.child, sc));
      }
      const bm = BUILTIN_MODS[name];
      if (!bm) {
        this.warn(`Módulo desconhecido '${st.name}'`, st.line);
        return EMPTY();
      }
      const cs = new Scope(sc, sc);
      const pos = [], named = {};
      for (const a of st.args) {
        const v = this.ev(a.expr, sc);
        if (a.name) { if (a.name[0] === '$') cs.vars.set(a.name, v); else named[a.name] = v; }
        else pos.push(v);
      }
      const ctx = {
        it: this, sc: cs, line: st.line, pos, named, name,
        arg: (names, d) => {
          for (let i = 0; i < names.length; i++) {
            const nm = names[i];
            if (nm && named[nm] !== undefined) return named[nm];
          }
          return d;
        },
        children: () => this.evalChildren(st.child, cs),
      };
      if (++this.depth > 3000) throw new ScadError('Aninhamento profundo demais', st.line);
      try { return bm(ctx) || EMPTY(); }
      catch (e) {
        if (e instanceof ScadError || e instanceof RangeError) throw e;
        throw new ScadError(`Falha de geometria em ${st.name}(): ${e.message || e}`, st.line);
      } finally { this.depth--; }
    }

    callModule(um, st, sc) {
      if (++this.depth > 3000) throw new ScadError('Recursão profunda demais em módulo', st.line);
      try {
        const ms = new Scope(um.scope, sc);
        // $-args are visible to children as well
        const childCallScope = new Scope(sc, sc);
        for (const a of st.args) if (a.name && a.name[0] === '$') childCallScope.vars.set(a.name, this.ev(a.expr, sc));
        this.bindParams(um.params, st.args, sc, ms, st.line);
        let stmts = [];
        if (st.child) stmts = st.child.type === 'block' && !st.child.mod ? st.child.body : [st.child];
        const instStmts = stmts.filter((s) => !['assign', 'moddef', 'fundef', 'include'].includes(s.type));
        ms.childInfo = { all: stmts, inst: instStmts, scope: childCallScope };
        ms.vars.set('$children', instStmts.length);
        const body = um.body ? (um.body.type === 'block' && !um.body.mod ? um.body.body : [um.body]) : [];
        return merge(this.runBlock(body, ms));
      } finally { this.depth--; }
    }

    children(st, sc) {
      const info = sc.findChildren();
      if (!info) return EMPTY();
      const { pos, named } = this.evArgs(st.args, sc);
      const sel = 'index' in named ? named.index : pos[0];
      let idxs;
      if (sel === undefined) idxs = info.inst.map((_, i) => i);
      else idxs = iterValues(sel, this, st.line).filter(isNum).map(Math.floor);
      const cs = new Scope(info.scope, sc);
      for (const s of info.all) {
        if (s.type === 'moddef') cs.defMod(s.name, { params: s.params, body: s.body, scope: cs });
        else if (s.type === 'fundef') cs.defFunc(s.name, { params: s.params, expr: s.expr, scope: cs });
      }
      for (const s of info.all) if (s.type === 'assign') cs.vars.set(s.name, this.ev(s.expr, cs));
      const lists = [];
      for (const i of idxs) {
        if (i < 0 || i >= info.inst.length) { this.warn(`children(${i}) fora do intervalo`, st.line); continue; }
        lists.push(this.stmt(info.inst[i], cs));
      }
      return merge(lists);
    }

    booleanOp(kind, lists, line) {
      const ghosts = [];
      for (const l of lists) for (const g of l.ghosts) ghosts.push(g);
      const nonEmpty = lists.filter((l) => l.solids.length);
      if (!nonEmpty.length) return { solids: [], ghosts };
      const dim = mainDim(nonEmpty[0].solids);
      if (lists.some((l) => l.solids.some((o) => o.dim !== dim))) this.warn('Mistura de objetos 2D e 3D: os de dimensão diferente foram ignorados', line);
      const parts = nonEmpty.map((l) => unionObjs(l.solids, dim)).filter(Boolean);
      if (kind === 'union') {
        if (parts.length === 1) return { solids: [parts[0]], ghosts };
        const g = dim === 2 ? P2.union(parts.map((p) => p.g)) : S3.union(parts.map((p) => p.g));
        return { solids: [{ g, dim, color: parts[0].color, line: parts[0].line }], ghosts };
      }
      if (kind === 'difference') {
        const first = lists.findIndex((l) => l.solids.length);
        const base = unionObjs(lists[first].solids, dim);
        if (!base) return { solids: [], ghosts };
        const tools = [];
        for (let i = first + 1; i < lists.length; i++) for (const o of lists[i].solids) if (o.dim === dim) tools.push(o.g);
        let g = base.g;
        if (tools.length) g = dim === 2 ? P2.difference(base.g, tools) : S3.difference(base.g, tools);
        return { solids: [{ g, dim, color: base.color, line: base.line }], ghosts };
      }
      if (kind === 'intersection') {
        if (parts.length === 1) return { solids: [parts[0]], ghosts };
        const g = dim === 2 ? P2.intersection(parts.map((p) => p.g)) : S3.intersection(parts.map((p) => p.g));
        return { solids: [{ g, dim, color: parts[0].color, line: parts[0].line }], ghosts };
      }
      return { solids: [], ghosts };
    }
  }

  // ───────────────────────────── Builtin modules ─────────────────────────────
  const vec3arg = (v, d) => {
    if (isNum(v)) return [v, v, v];
    if (isVec(v)) return [num(v[0], d), num(v[1], d), num(v[2], d)];
    return [d, d, d];
  };

  function prim(ctx, g, dim) {
    if (!g) return EMPTY();
    return { solids: [mkObj(g, dim, ctx.line)], ghosts: [] };
  }

  const BUILTIN_MODS = {
    cube(ctx) {
      const size = ctx.arg(['size'], ctx.pos[0]);
      const center = truthy(ctx.arg(['center'], ctx.pos[1]));
      const [x, y, z] = vec3arg(size === undefined ? 1 : size, 1);
      if (!(x > 0 && y > 0 && z > 0)) { ctx.it.warn('cube() com tamanho zero ou negativo foi ignorado', ctx.line); return EMPTY(); }
      need3D();
      return prim(ctx, keep(MF.Manifold.cube([x, y, z], center)), 3);
    },
    sphere(ctx) {
      let r = ctx.arg(['r'], ctx.pos[0]);
      const d = ctx.arg(['d']);
      if (isNum(d)) r = d / 2;
      if (!isNum(r)) r = 1;
      if (!(r > 0)) return EMPTY();
      const frags = fragments(r, ctx.sc);
      const rings = Math.floor((frags + 1) / 2);
      const ring = [];
      for (let i = 0; i < rings; i++) {
        const phi = (180 * (i + 0.5)) / rings;
        const rr = r * sind(phi), z = r * cosd(phi);
        ring.push(circlePts(rr, frags).map((p) => [p[0], p[1], z]));
      }
      const faces = [];
      faces.push(ring[0].slice());
      for (let i = 0; i < rings - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        for (let j = 0; j < frags; j++) {
          const j1 = (j + 1) % frags;
          faces.push([a[j], b[j], b[j1], a[j1]]);
        }
      }
      faces.push(ring[rings - 1].slice().reverse());
      return prim(ctx, solidFromFaces(faces), 3);
    },
    cylinder(ctx) {
      let h = ctx.arg(['h'], ctx.pos[0]);
      let r1 = ctx.arg(['r1'], ctx.pos[1]);
      let r2 = ctx.arg(['r2'], ctx.pos[2]);
      const center = truthy(ctx.arg(['center'], ctx.pos[3]));
      const r = ctx.arg(['r']), d = ctx.arg(['d']), d1 = ctx.arg(['d1']), d2 = ctx.arg(['d2']);
      if (!isNum(h)) h = 1;
      if (isNum(r)) { r1 = r; r2 = r; }
      if (isNum(d)) { r1 = d / 2; r2 = d / 2; }
      if (isNum(d1)) r1 = d1 / 2;
      if (isNum(d2)) r2 = d2 / 2;
      if (!isNum(r1)) r1 = 1;
      if (!isNum(r2)) r2 = 1;
      if (!(h > 0) || r1 < 0 || r2 < 0 || (r1 <= 0 && r2 <= 0)) { ctx.it.warn('cylinder() com dimensões inválidas foi ignorado', ctx.line); return EMPTY(); }
      const frags = fragments(Math.max(r1, r2), ctx.sc);
      const z0 = center ? -h / 2 : 0, z1 = z0 + h;
      const bot = r1 > 0 ? circlePts(r1, frags).map((p) => [p[0], p[1], z0]) : null;
      const top = r2 > 0 ? circlePts(r2, frags).map((p) => [p[0], p[1], z1]) : null;
      const faces = [];
      if (bot) faces.push(bot.slice().reverse());
      if (top) faces.push(top.slice());
      for (let j = 0; j < frags; j++) {
        const j1 = (j + 1) % frags;
        if (bot && top) faces.push([bot[j], bot[j1], top[j1], top[j]]);
        else if (bot) faces.push([bot[j], bot[j1], [0, 0, z1]]);
        else faces.push([[0, 0, z0], top[j1], top[j]]);
      }
      return prim(ctx, solidFromFaces(faces), 3);
    },
    polyhedron(ctx) {
      const pts = ctx.arg(['points'], ctx.pos[0]);
      const faces = ctx.arg(['faces', 'triangles'], ctx.pos[1]);
      if (!isVec(pts) || !isVec(faces)) { ctx.it.warn('polyhedron() precisa de points e faces', ctx.line); return EMPTY(); }
      const fl = [];
      for (const f of faces) {
        if (!isVec(f) || f.length < 3) continue;
        const poly = f.map((i) => pts[i]).filter((p) => isVec(p)).map((p) => [num(p[0], 0), num(p[1], 0), num(p[2], 0)]);
        if (poly.length >= 3) fl.push(poly.reverse()); // no OpenSCAD as faces são horárias
      }
      try { return prim(ctx, solidFromFaces(fl), 3); }
      catch (e) {
        ctx.it.warn('polyhedron(): as faces não formam um sólido fechado (confira se todas as arestas são compartilhadas por duas faces e se todas estão no sentido horário vistas de fora)', ctx.line);
        return EMPTY();
      }
    },
    square(ctx) {
      const size = ctx.arg(['size'], ctx.pos[0]);
      const center = truthy(ctx.arg(['center'], ctx.pos[1]));
      let x = 1, y = 1;
      if (isNum(size)) { x = y = size; } else if (isVec(size)) { x = num(size[0], 1); y = num(size[1], 1); }
      if (!(x > 0 && y > 0)) return EMPTY();
      const ox = center ? -x / 2 : 0, oy = center ? -y / 2 : 0;
      return prim(ctx, poly2([[ox, oy], [ox + x, oy], [ox + x, oy + y], [ox, oy + y]]), 2);
    },
    circle(ctx) {
      let r = ctx.arg(['r'], ctx.pos[0]);
      const d = ctx.arg(['d']);
      if (isNum(d)) r = d / 2;
      if (!isNum(r)) r = 1;
      if (!(r > 0)) return EMPTY();
      return prim(ctx, poly2(circlePts(r, fragments(r, ctx.sc))), 2);
    },
    polygon(ctx) {
      const pts = ctx.arg(['points'], ctx.pos[0]);
      let paths = ctx.arg(['paths'], ctx.pos[1]);
      if (!isVec(pts) || pts.length < 3) { ctx.it.warn('polygon() precisa de pelo menos 3 pontos', ctx.line); return EMPTY(); }
      if (!isVec(paths)) paths = [pts.map((_, i) => i)];
      // como no OpenSCAD: os contornos são combinados pela regra par-ímpar (limpa autointerseções e pontas)
      const rings = [];
      for (const path of paths) {
        if (!isVec(path)) continue;
        const ring = path.map((i) => pts[i]).filter(isVec).map((p) => [num(p[0], 0), num(p[1], 0)]);
        if (ring.length >= 3) rings.push(ring);
      }
      const g = P2.sanitize(rings, true);
      return g.length ? prim(ctx, g, 2) : EMPTY();
    },
    text(ctx) {
      let t = ctx.arg(['text'], ctx.pos[0]);
      const size = num(ctx.arg(['size'], ctx.pos[1]), 10);
      const halign = ctx.arg(['halign'], 'left'), valign = ctx.arg(['valign'], 'baseline');
      const spacing = num(ctx.arg(['spacing']), 1);
      if (t === undefined) return EMPTY();
      const fontSpec = ctx.arg(['font']);
      if (fontSpec !== undefined && OT) {
        const font = findFont(fmt(fontSpec, false));
        if (font) {
          const str = fmt(t, false);
          if (!str.trim()) return EMPTY();
          const rings = fontRings(font, str, size, spacing, 8);
          let g = rings.length ? P2.sanitize(rings, false) : [];
          if (!g.length) return EMPTY();
          const bb = P2.bounds(g);
          let dx = 0, dy = 0;
          if (halign === 'center') dx = -(bb[0][0] + bb[1][0]) / 2; else if (halign === 'right') dx = -bb[1][0];
          if (valign === 'center') dy = -(bb[0][1] + bb[1][1]) / 2; else if (valign === 'top') dy = -bb[1][1]; else if (valign === 'bottom') dy = -bb[0][1];
          if (dx || dy) g = P2.transform(g, Tm(dx, dy, 0));
          return prim(ctx, g, 2);
        }
        const spec = fmt(fontSpec, false);
        ctx.it.fontsWanted.add(spec);
        ctx.it.warn(`Fonte '${spec}' não encontrada; usando a fonte simples. Escreva o nome de uma fonte do Google Fonts ou envie o arquivo na aba Biblioteca.`, ctx.line);
      }
      t = fmt(t, false).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e\n]/g, '?');
      const segs = J.text.vectorText({ height: size * 0.72, letterSpacing: spacing, input: t });
      const w = size * 0.11;
      const lines = segs.filter((seg) => seg.length >= 2);
      if (!lines.length) return EMPTY();
      let g = P2.strokes(lines, w);
      if (!g.length) return EMPTY();
      const bb = P2.bounds(g);
      let dx = 0, dy = 0;
      if (halign === 'center') dx = -(bb[0][0] + bb[1][0]) / 2; else if (halign === 'right') dx = -bb[1][0]; else dx = -Math.min(0, bb[0][0]);
      if (valign === 'center') dy = -(bb[0][1] + bb[1][1]) / 2; else if (valign === 'top') dy = -bb[1][1]; else if (valign === 'bottom') dy = -bb[0][1];
      if (dx || dy) g = P2.transform(g, Tm(dx, dy, 0));
      return prim(ctx, g, 2);
    },

    // transforms
    translate(ctx) {
      const v = vec3arg(ctx.arg(['v'], ctx.pos[0]), 0);
      return applyMatrix(merge(ctx.children()), Tm(v[0], v[1], v[2]));
    },
    rotate(ctx) {
      const a = ctx.arg(['a'], ctx.pos[0]);
      const v = ctx.arg(['v'], ctx.pos[1]);
      let m;
      if (isVec(a)) m = mm(Rz(num(a[2], 0)), mm(Ry(num(a[1], 0)), Rx(num(a[0], 0))));
      else if (isNum(a)) m = isVec(v) ? Raxis(a, vec3arg(v, 0)) : Rz(a);
      else m = I4();
      return applyMatrix(merge(ctx.children()), m);
    },
    scale(ctx) {
      const v = ctx.arg(['v'], ctx.pos[0]);
      const s = vec3arg(v === undefined ? 1 : v, 1);
      return applyMatrix(merge(ctx.children()), Sm(s[0], s[1], s[2]));
    },
    mirror(ctx) {
      const v = vec3arg(ctx.arg(['v'], ctx.pos[0]), 0);
      const l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      if (l2 < 1e-12) return merge(ctx.children());
      const [x, y, z] = v;
      const m = [
        [1 - (2 * x * x) / l2, (-2 * x * y) / l2, (-2 * x * z) / l2, 0],
        [(-2 * x * y) / l2, 1 - (2 * y * y) / l2, (-2 * y * z) / l2, 0],
        [(-2 * x * z) / l2, (-2 * y * z) / l2, 1 - (2 * z * z) / l2, 0],
        [0, 0, 0, 1],
      ];
      return applyMatrix(merge(ctx.children()), m);
    },
    multmatrix(ctx) {
      const mtx = ctx.arg(['m'], ctx.pos[0]);
      const m = I4();
      if (isVec(mtx)) for (let r = 0; r < Math.min(4, mtx.length); r++) if (isVec(mtx[r])) for (let c = 0; c < 4; c++) if (isNum(mtx[r][c])) m[r][c] = mtx[r][c];
      return applyMatrix(merge(ctx.children()), m);
    },
    resize(ctx) {
      const ns = ctx.arg(['newsize'], ctx.pos[0]);
      const auto = ctx.arg(['auto'], ctx.pos[1]);
      const list = merge(ctx.children());
      if (!list.solids.length || !isVec(ns)) return list;
      const bbs = list.solids.map(objBounds);
      const mn = [0, 1, 2].map((i) => Math.min(...bbs.map((b) => b[0][i])));
      const mx = [0, 1, 2].map((i) => Math.max(...bbs.map((b) => b[1][i])));
      const size = [0, 1, 2].map((i) => mx[i] - mn[i]);
      const f = [0, 1, 2].map((i) => (isNum(ns[i]) && ns[i] > 0 && size[i] > 1e-12 ? ns[i] / size[i] : null));
      const ref = f.find((x) => x !== null) ?? 1;
      const autos = [0, 1, 2].map((i) => (isVec(auto) ? truthy(auto[i]) : truthy(auto)));
      const s = f.map((x, i) => (x !== null ? x : autos[i] ? ref : 1));
      return applyMatrix(list, Sm(s[0], s[1], s[2]));
    },
    color(ctx) {
      const c = ctx.arg(['c'], ctx.pos[0]);
      const alpha = ctx.arg(['alpha'], ctx.pos[1]);
      const rgba = parseColor(c, alpha);
      if (c !== undefined && !rgba) ctx.it.warn(`Cor desconhecida '${fmt(c, false)}'`, ctx.line);
      const list = merge(ctx.children());
      if (!rgba) return list;
      return { solids: list.solids.map((o) => (o.color ? o : { ...o, color: rgba })), ghosts: list.ghosts };
    },
    offset(ctx) {
      const r = ctx.arg(['r'], ctx.pos[0]);
      const delta = ctx.arg(['delta']);
      const chamfer = truthy(ctx.arg(['chamfer']));
      const list = merge(ctx.children());
      const u = unionObjs(list.solids, 2);
      if (!u) return list;
      let g;
      if (isNum(r)) {
        if (r === 0) return { solids: [u], ghosts: list.ghosts };
        const n = fragments(Math.abs(r), ctx.sc);
        g = P2.offset(u.g, r, 'round', Math.abs(r) * (1 - cosd(180 / n)));
      } else if (isNum(delta)) {
        if (delta === 0) return { solids: [u], ghosts: list.ghosts };
        g = P2.offset(u.g, delta, chamfer ? 'square' : 'miter', 0);
      } else return list;
      return { solids: [{ ...u, g }], ghosts: list.ghosts };
    },

    // booleans
    union(ctx) { return ctx.it.booleanOp('union', ctx.children(), ctx.line); },
    difference(ctx) { return ctx.it.booleanOp('difference', ctx.children(), ctx.line); },
    intersection(ctx) { return ctx.it.booleanOp('intersection', ctx.children(), ctx.line); },
    hull(ctx) {
      const list = merge(ctx.children());
      if (!list.solids.length) return list;
      const dim = mainDim(list.solids);
      const sel = list.solids.filter((o) => o.dim === dim);
      let g;
      if (dim === 2) {
        const pts = [], seen = new Set();
        for (const o of sel) for (const p of o.g) for (const q of p) { const k = q[0].toFixed(6) + ',' + q[1].toFixed(6); if (!seen.has(k)) { seen.add(k); pts.push([q[0], q[1]]); } }
        g = pts.length >= 3 ? poly2(hull2(pts)) || [] : [];
      } else { need3D(); g = keep(MF.Manifold.hull(sel.map((o) => o.g))); }
      return { solids: [{ g, dim, color: sel[0].color, line: sel[0].line }], ghosts: list.ghosts };
    },
    minkowski(ctx) {
      const lists = ctx.children().filter((l) => l.solids.length);
      const ghosts = [].concat(...ctx.children().map((l) => l.ghosts));
      if (!lists.length) return { solids: [], ghosts };
      const dim = mainDim(lists[0].solids);
      const parts = lists.map((l) => unionObjs(l.solids, dim)).filter(Boolean);
      if (parts.length === 1) return { solids: [parts[0]], ghosts };
      if (dim === 2) {
        let acc2 = parts[0].g;
        for (let i = 1; i < parts.length; i++) acc2 = P2.minkowski(acc2, parts[i].g);
        return { solids: [{ g: acc2, dim, color: parts[0].color, line: parts[0].line }], ghosts };
      }
      let g = parts[0].g;
      for (let i = 1; i < parts.length; i++) g = keep(g.minkowskiSum(parts[i].g));
      return { solids: [{ g, dim, color: parts[0].color, line: parts[0].line }], ghosts };
    },
    render(ctx) { return merge(ctx.children()); },
    group(ctx) { return merge(ctx.children()); },

    linear_extrude(ctx) {
      let h = ctx.arg(['height'], ctx.pos[0]);
      const center = truthy(ctx.arg(['center'], ctx.pos[1]));
      const twist = num(ctx.arg(['twist']), 0);
      let slices = ctx.arg(['slices']);
      let sc = ctx.arg(['scale'], 1);
      if (isVec(h)) h = h[2];
      if (!isNum(h)) h = 100;
      const list = merge(ctx.children());
      const u = unionObjs(list.solids, 2);
      if (!u || !u.g.length || !(h > 0)) return { solids: [], ghosts: list.ghosts };
      const sx = Math.max(isVec(sc) ? num(sc[0], 1) : num(sc, 1), 0), sy = Math.max(isVec(sc) ? num(sc[1], 1) : num(sc, 1), 0);
      if (!isNum(slices) || slices < 1) {
        if (twist === 0) slices = 1;
        else {
          const fn = num(ctx.sc.get('$fn'), 0);
          slices = fn > 0 ? Math.max(3, Math.ceil((Math.abs(twist) / 360) * fn)) : Math.max(4, Math.ceil(Math.abs(twist) / 5));
        }
      }
      slices = Math.min(Math.floor(slices), 2000);
      // no Manifold a torção positiva é anti-horária; no OpenSCAD, horária
      const g = withCS(u.g, (cs) => keep(MF.Manifold.extrude(cs, h, slices - 1, -twist, [sx, sy], center)));
      return { solids: [{ ...u, g, dim: 3 }], ghosts: list.ghosts };
    },
    rotate_extrude(ctx) {
      let angle = num(ctx.arg(['angle'], ctx.pos[0]), 360);
      const list = merge(ctx.children());
      const u = unionObjs(list.solids, 2);
      if (!u || !u.g.length) return { solids: [], ghosts: list.ghosts };
      const bb = P2.bounds(u.g);
      if (bb[0][0] < -1e-9 && bb[1][0] > 1e-9) { ctx.it.warn('rotate_extrude(): todos os pontos precisam ter x ≥ 0 (o perfil cruza o eixo)', ctx.line); }
      const maxR = Math.max(Math.abs(bb[0][0]), Math.abs(bb[1][0]));
      angle = Math.max(-360, Math.min(360, angle));
      if (angle === 0) return { solids: [], ghosts: list.ghosts };
      // como no OpenSCAD: os segmentos são proporcionais ao ângulo (o Manifold conta só o trecho girado
      // e precisa de no mínimo 3)
      const full = fragments(maxR, ctx.sc);
      const segs = Math.abs(angle) >= 360 ? Math.max(3, full) : Math.max(3, Math.ceil((full * Math.abs(angle)) / 360));
      let g = withCS(u.g, (cs) => keep(MF.Manifold.revolve(cs, segs, Math.abs(angle))));
      // ângulo negativo: gira no sentido horário (= espelho no plano XZ)
      if (angle < 0) g = S3.transform(g, Sm(1, -1, 1));
      return { solids: [{ ...u, g, dim: 3 }], ghosts: list.ghosts };
    },
    projection(ctx) {
      const cut = truthy(ctx.arg(['cut'], ctx.pos[0]));
      const list = merge(ctx.children());
      const u = unionObjs(list.solids, 3);
      if (!u) return { solids: [], ghosts: list.ghosts };
      // cut = true: o corte no plano z = 0; senão, a sombra da peça vista de cima
      const g = csToPaths(cut ? u.g.slice(0) : u.g.project());
      return { solids: [{ ...u, g, dim: 2 }], ghosts: list.ghosts };
    },
    import(ctx) { ctx.it.warn('import() de arquivos não é suportado nesta versão', ctx.line); return EMPTY(); },
    surface(ctx) { ctx.it.warn('surface() não é suportado nesta versão', ctx.line); return EMPTY(); },
  };

  // Atalhos em português
  const ALIASES = {
    cubo: 'cube', esfera: 'sphere', cilindro: 'cylinder', poliedro: 'polyhedron', quadrado: 'square', retangulo: 'square',
    circulo: 'circle', poligono: 'polygon', texto: 'text', mover: 'translate', girar: 'rotate', escalar: 'scale',
    espelhar: 'mirror', cor: 'color', uniao: 'union', diferenca: 'difference', intersecao: 'intersection',
    envoltoria: 'hull', extrudar: 'linear_extrude', revolver: 'rotate_extrude', redimensionar: 'resize',
    contorno: 'offset', projecao: 'projection', filhos: 'children',
  };

  // ───────────────────────────── Builtin functions ─────────────────────────────
  function mulberry32(a) {
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const n1 = (f) => (p) => (isNum(p[0]) ? f(p[0]) : undefined);
  const flatNums = (p) => (p.length === 1 && isVec(p[0]) ? p[0] : p);
  const BUILTIN_FUNCS = {
    sin: n1(sind), cos: n1(cosd),
    tan: n1((x) => { const m = ((x % 180) + 180) % 180; if (m === 0) return 0; if (m === 90) return Infinity; if (m === 45) return 1; if (m === 135) return -1; return Math.tan(x * DEG); }),
    asin: n1((x) => Math.asin(x) / DEG), acos: n1((x) => Math.acos(x) / DEG), atan: n1((x) => Math.atan(x) / DEG),
    atan2: (p) => (isNum(p[0]) && isNum(p[1]) ? Math.atan2(p[0], p[1]) / DEG : undefined),
    abs: n1(Math.abs), sign: n1(Math.sign), floor: n1(Math.floor), ceil: n1(Math.ceil),
    round: n1((x) => Math.sign(x) * Math.round(Math.abs(x))),
    ln: n1(Math.log), exp: n1(Math.exp), sqrt: n1(Math.sqrt),
    log: (p) => (p.length >= 2 && isNum(p[0]) && isNum(p[1]) ? Math.log(p[1]) / Math.log(p[0]) : isNum(p[0]) ? Math.log10(p[0]) : undefined),
    pow: (p) => (isNum(p[0]) && isNum(p[1]) ? Math.pow(p[0], p[1]) : undefined),
    min: (p) => { const v = flatNums(p); return v.length && v.every(isNum) ? Math.min(...v) : undefined; },
    max: (p) => { const v = flatNums(p); return v.length && v.every(isNum) ? Math.max(...v) : undefined; },
    norm: (p) => (isNumVec(p[0]) ? Math.sqrt(p[0].reduce((s, x) => s + x * x, 0)) : undefined),
    cross: (p) => {
      const [a, b] = p;
      if (!isNumVec(a) || !isNumVec(b)) return undefined;
      if (a.length === 2 && b.length === 2) return a[0] * b[1] - a[1] * b[0];
      if (a.length === 3 && b.length === 3) return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      return undefined;
    },
    len: (p) => (isVec(p[0]) || typeof p[0] === 'string' ? p[0].length : undefined),
    concat: (p) => { const out = []; for (const v of p) { if (isVec(v)) out.push(...v); else out.push(v); } return out; },
    lookup: (p) => {
      const [k, t] = p;
      if (!isNum(k) || !isVec(t) || !t.length) return undefined;
      const tab = t.filter((r) => isNumVec(r) && r.length >= 2);
      if (!tab.length) return undefined;
      if (k <= tab[0][0]) return tab[0][1];
      for (let i = 1; i < tab.length; i++) {
        if (k <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + ((k - x0) / (x1 - x0)) * (y1 - y0); }
      }
      return tab[tab.length - 1][1];
    },
    chr: (p) => p.map((v) => (isNum(v) ? String.fromCodePoint(v) : isVec(v) ? v.map((x) => String.fromCodePoint(x)).join('') : '')).join(''),
    ord: (p) => (typeof p[0] === 'string' && p[0].length ? p[0].codePointAt(0) : undefined),
    search: (p) => {
      const [m, s, numReturns = 1, col = 0] = p;
      const hay = typeof s === 'string' ? Array.from(s) : isVec(s) ? s : [];
      const keyOf = (e) => (isVec(e) ? e[col] : e);
      const find = (needle) => {
        const hits = [];
        for (let i = 0; i < hay.length; i++) if (equal(keyOf(hay[i]), needle)) { hits.push(i); if (numReturns > 0 && hits.length >= numReturns) break; }
        return hits;
      };
      if (isNum(m)) return find(m);
      if (typeof m === 'string') {
        const chars = Array.from(m);
        return chars.map((c) => { const h = find(c); return numReturns === 1 ? (h.length ? h[0] : []) : h; });
      }
      if (isVec(m)) return m.map((x) => { const h = find(x); return numReturns === 1 ? (h.length ? h[0] : []) : h; });
      return undefined;
    },
    rands: (p) => {
      const [lo, hi, count, seed] = p;
      if (!isNum(lo) || !isNum(hi) || !isNum(count)) return undefined;
      const rnd = isNum(seed) ? mulberry32(Math.floor(seed)) : Math.random;
      const out = [];
      for (let i = 0; i < Math.min(count, 1e6); i++) out.push(lo + rnd() * (hi - lo));
      return out;
    },
    is_undef: (p) => p[0] === undefined, is_num: (p) => isNum(p[0]) && !Number.isNaN(p[0]), is_bool: (p) => typeof p[0] === 'boolean',
    is_string: (p) => typeof p[0] === 'string', is_list: (p) => isVec(p[0]), is_function: (p) => isFn(p[0]),
    version: () => [2021, 1, 0], version_num: () => 20210100,
  };
  BUILTIN_FUNCS.str = (p) => p.map((v) => (typeof v === 'string' ? v : fmt(v, true))).join('');

  // ───────────────────────────── Customizer parameters ─────────────────────────────
  function isLiteral(e) {
    if (!e) return false;
    if (e.type === 'lit') return e.v !== undefined;
    if (e.type === 'un' && e.op === '-' && e.a.type === 'lit' && isNum(e.a.v)) return true;
    if (e.type === 'vec') return e.elems.length > 0 && e.elems.length <= 4 && e.elems.every((x) => (x.type === 'lit' && isNum(x.v)) || (x.type === 'un' && x.op === '-' && x.a.type === 'lit' && isNum(x.a.v)));
    return false;
  }
  function parseAnnotation(ann, value) {
    if (!ann) return null;
    const m = ann.match(/^\s*\[(.*)\]\s*$/);
    if (!m) return null;
    const inner = m[1].trim();
    if (!inner) return null;
    if (inner.includes(',')) {
      const opts = inner.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const k = s.indexOf(':');
        let v = k >= 0 ? s.slice(0, k).trim() : s, label = k >= 0 ? s.slice(k + 1).trim() : null;
        v = v.replace(/^"(.*)"$/, '$1');
        const val = isNum(value) && !isNaN(parseFloat(v)) ? parseFloat(v) : v;
        return { value: val, label: label || String(val) };
      });
      return { kind: 'select', options: opts };
    }
    const parts = inner.split(':').map((s) => parseFloat(s));
    if (parts.some((x) => Number.isNaN(x))) return null;
    if (parts.length === 1) return { kind: 'slider', min: 0, max: parts[0], step: null };
    if (parts.length === 2) return { kind: 'slider', min: parts[0], max: parts[1], step: null };
    return { kind: 'slider', min: parts[0], step: parts[1], max: parts[2] };
  }
  function extractParams(src, ast) {
    const params = [];
    if (!ast) return params;
    const lines = src.split('\n');
    let group = null, hidden = false, prevEnd = 0;
    const groupRe = /\/\*\s*\[([^\]]+)\]\s*\*\//g;
    const it = new Interp({});
    const sc = new Scope(null, null);
    // como no OpenSCAD: só entram as atribuições antes da primeira '{' do arquivo (fora de comentários e textos)
    let stopAt = src.length;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; continue; }
      if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); i = n < 0 ? src.length : n + 1; continue; }
      if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } continue; }
      if (c === '{') { stopAt = i; break; }
    }
    for (const st of ast.body) {
      if (st.type !== 'assign') continue;
      if (st.s >= stopAt) break;
      const between = src.slice(prevEnd, st.s);
      let m;
      groupRe.lastIndex = 0;
      while ((m = groupRe.exec(between))) { group = m[1].trim(); hidden = /^hidden$/i.test(group) || /^oculto$/i.test(group); }
      prevEnd = st.e;
      if (hidden || st.name[0] === '$' || !isLiteral(st.expr)) continue;
      const lineText = lines[st.line - 1] || '';
      const lineStart = src.lastIndexOf('\n', st.e - 1) + 1;
      const rest = src.slice(st.e, lineStart + lineText.length);
      const cm = rest.match(/^\s*\/\/(.*)$/);
      let desc = null;
      const prevLine = (lines[st.line - 2] || '').trim();
      if (prevLine.startsWith('//')) desc = prevLine.replace(/^\/\/+\s*/, '');
      const value = it.ev(st.expr, sc);
      params.push({
        name: st.name, line: st.line, s: st.expr.s, e: st.expr.e, value,
        type: typeof value === 'boolean' ? 'bool' : typeof value === 'string' ? 'string' : isVec(value) ? 'vector' : 'number',
        ann: parseAnnotation(cm ? cm[1] : null, value), desc, group,
      });
    }
    return params;
  }
  function literalText(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (isNum(v)) return String(parseFloat(v.toFixed(6)));
    if (isVec(v)) return '[' + v.map(literalText).join(', ') + ']';
    return 'undef';
  }

  // ───────────────────────────── Run ─────────────────────────────
  function run(src, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const result = { objects: [], ghosts: [], echoes: [], warnings: [], error: null, ast: null, time: 0 };
    const arena = [];
    result.dispose = () => freeAll(arena);
    let it = null;
    ARENA = arena;
    try {
      const ast = parse(src);
      result.ast = ast;
      it = new Interp(opts);
      const top = new Scope(null, null);
      it.top = top;
      top.vars.set('$fn', 0); top.vars.set('$fa', 12); top.vars.set('$fs', 2); top.vars.set('$t', num(opts.t, 0));
      top.vars.set('$preview', true); top.vars.set('$children', 0);
      top.vars.set('$vpr', [55, 0, 25]); top.vars.set('$vpt', [0, 0, 0]); top.vars.set('$vpd', 140); top.vars.set('$vpf', 22.5);
      const lists = it.runBlock(ast.body, top);
      const out = it.root || merge(lists);
      result.objects = out.solids.filter((o) => !isEmptyGeom(o));
      result.ghosts = out.ghosts.filter((o) => !isEmptyGeom(o));
    } catch (e) {
      let msg = e.message || String(e);
      if (e instanceof RangeError) msg = 'Recursão profunda demais (estouro de pilha)';
      else if (!(e instanceof ScadError)) msg = 'Erro de geometria: ' + msg;
      result.error = { msg, line: e.line || null };
      result.objects = []; result.ghosts = [];
      freeAll(arena);
    } finally {
      ARENA = null;
    }
    if (it) { result.echoes = it.echoes; result.warnings = it.warnings; result.fontsWanted = [...it.fontsWanted]; }
    result.time = Date.now() - t0;
    return result;
  }

  // ───────────────────────────── Output helpers ─────────────────────────────
  // malha do Manifold → triângulos soltos (x, y, z por vértice), para a visualização
  function meshOf(g) {
    const m = g.getMesh();
    return { pos: m.vertProperties, tri: m.triVerts, np: m.numProp };
  }
  function toTriangles(obj, thickness2d) {
    let g = obj.g, temp = null;
    if (obj.dim === 2) {
      const h = thickness2d || 1;
      temp = withCS(g, (cs) => MF.Manifold.extrude(cs, h, 0, 0, [1, 1], true));
      g = temp;
    }
    try {
      const { pos, tri, np } = meshOf(g);
      const arr = new Float32Array(tri.length * 3);
      for (let i = 0; i < tri.length; i++) {
        const v = tri[i] * np;
        arr[3 * i] = pos[v]; arr[3 * i + 1] = pos[v + 1]; arr[3 * i + 2] = pos[v + 2];
      }
      return arr;
    } finally { if (temp) temp.delete(); }
  }

  // todos os sólidos 3D numa malha só, pronta para o arquivo. O Manifold calcula em precisão dupla
  // mas entrega float32 (a precisão do STL): vértices muito próximos podem virar o mesmo ponto.
  // Aqui os vértices são juntados pelo valor exato em float32, como faz o fatiador, e triângulos
  // que ficaram com dois cantos no mesmo ponto saem. 0 e -0 viram o mesmo número.
  function exportMesh(objects) {
    const solids = objects.filter((o) => o.dim === 3 && !o.g.isEmpty()).map((o) => o.g);
    if (!solids.length) return null;
    const g = solids.length === 1 ? solids[0] : MF.Manifold.union(solids);
    let m;
    try { m = meshOf(g); } finally { if (solids.length > 1) g.delete(); }
    const np = m.np, src = m.pos, T = m.tri;
    const f = new Float32Array(3), bits = new Uint32Array(f.buffer);
    const ids = new Map(), pos = [], remap = new Int32Array(src.length / np);
    for (let v = 0; v < remap.length; v++) {
      f[0] = src[v * np] + 0; f[1] = src[v * np + 1] + 0; f[2] = src[v * np + 2] + 0;
      const k = bits[0] + ',' + bits[1] + ',' + bits[2];
      let i = ids.get(k);
      if (i === undefined) { i = pos.length / 3; ids.set(k, i); pos.push(f[0], f[1], f[2]); }
      remap[v] = i;
    }
    const tri = [];
    for (let t = 0; t < T.length; t += 3) {
      const a = remap[T[t]], b = remap[T[t + 1]], c = remap[T[t + 2]];
      if (a !== b && b !== c && a !== c) tri.push(a, b, c);
    }
    return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri), np: 3 };
  }

  function toSTL(objects, name) {
    const mesh = exportMesh(objects);
    if (!mesh) return null;
    const { pos, tri, np } = mesh;
    const n = tri.length / 3;
    const buf = new ArrayBuffer(84 + n * 50);
    const dv = new DataView(buf);
    const header = ('Forja 3D - ' + (name || 'modelo')).slice(0, 79);
    for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
    dv.setUint32(80, n, true);
    let o = 84;
    for (let t = 0; t < n; t++) {
      const a = tri[3 * t] * np, b = tri[3 * t + 1] * np, c = tri[3 * t + 2] * np;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      o += 12;
      for (const v of [a, b, c]) { dv.setFloat32(o, pos[v], true); dv.setFloat32(o + 4, pos[v + 1], true); dv.setFloat32(o + 8, pos[v + 2], true); o += 12; }
      dv.setUint16(o, 0, true); o += 2;
    }
    return buf;
  }

  function toOBJ(objects) {
    const mesh = exportMesh(objects);
    if (!mesh) return null;
    const { pos, tri, np } = mesh;
    const lines = ['# Forja 3D'];
    for (let i = 0; i < pos.length; i += np) lines.push(`v ${+pos[i].toFixed(6)} ${+pos[i + 1].toFixed(6)} ${+pos[i + 2].toFixed(6)}`);
    for (let i = 0; i < tri.length; i += 3) lines.push(`f ${tri[i] + 1} ${tri[i + 1] + 1} ${tri[i + 2] + 1}`);
    return lines.join('\n') + '\n';
  }

  function toSVG(objects) {
    const twos = objects.filter((o) => o.dim === 2);
    if (!twos.length) return null;
    const outlines = twos.length === 1 ? twos[0].g : P2.union(twos.map((o) => o.g));
    const bb = P2.bounds(outlines);
    const [x0, y0] = bb[0], [x1, y1] = bb[1];
    const w = x1 - x0, h = y1 - y0;
    const d = outlines.map((ol) => 'M' + ol.map((p) => `${+(p[0] - x0).toFixed(4)},${+(y1 - p[1]).toFixed(4)}`).join(' L') + ' Z').join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${+w.toFixed(4)}mm" height="${+h.toFixed(4)}mm" viewBox="0 0 ${+w.toFixed(4)} ${+h.toFixed(4)}">\n<path d="${d}" fill="black" fill-rule="nonzero" stroke="none"/>\n</svg>\n`;
  }

  function bounds(objects) {
    if (!objects.length) return null;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const o of objects) {
      const b = objBounds(o);
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b[0][i]); mx[i] = Math.max(mx[i], b[1][i]); }
    }
    return [mn, mx];
  }

  function volume(objects) {
    let v = 0;
    for (const o of objects) if (o.dim === 3) v += o.g.volume();
    return v;
  }

  return {
    run, parse, lex, setFont, hasFont, extractParams, literalText, toTriangles, toSTL, toOBJ, toSVG, bounds, volume, fmt, setManifold,
    get has3D() { return !!MF; },
    ALIASES, BUILTIN_MODS: Object.keys(BUILTIN_MODS), BUILTIN_FUNCS: Object.keys(BUILTIN_FUNCS), ScadError,
  };
});
