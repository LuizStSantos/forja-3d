/* Forja 3D — atende os pedidos de renderização e exportação (usado no worker e, se ele falhar, na página) */
(function (root) {
  'use strict';
  function forjaHandler(E, timeLimit) {
    let last = null;
    // o resultado anterior guarda geometria na memória do WebAssembly: libera antes de calcular outro
    function runCode(code, libs, center) {
      if (last) { last.r.dispose(); last = null; }
      const r = E.run(code, { timeLimit, libs: libs || {}, center: !!center });
      last = { code, lk: JSON.stringify(libs || {}) + (center ? 'C' : ''), r };
      return r;
    }
    function useFonts(list) { (list || []).forEach((f) => E.setFont(f.family, f.style, f.data)); }
    return function (m) {
      if (m.type === 'hello') return { reply: { type: 'hello' }, transfer: [] };
      if (m.type === 'run') {
        useFonts(m.fonts);
        const r = runCode(m.code, m.libs, m.center);
        const meshes = [], transfer = [];
        const add = (o, ghost) => {
          try { const pos = E.toTriangles(o, 1); meshes.push({ pos, color: o.color, line: o.line, dim: o.dim, ghost }); transfer.push(pos.buffer); } catch (e) { /* ignora */ }
        };
        r.objects.forEach((o) => add(o, null));
        r.ghosts.forEach((o) => add(o, o.ghost));
        let bounds = null, volume = 0;
        try { bounds = r.objects.length ? E.bounds(r.objects) : r.ghosts.length ? E.bounds(r.ghosts) : null; volume = E.volume(r.objects); } catch (e) { /* ignora */ }
        return {
          reply: {
            type: 'result', id: m.id, meshes, bounds, volume, count: r.objects.length,
            has2d: r.objects.some((o) => o.dim === 2), has3d: r.objects.some((o) => o.dim === 3),
            echoes: r.echoes, warnings: r.warnings, fontsWanted: r.fontsWanted || [], error: r.error, time: r.time,
          },
          transfer,
        };
      }
      if (m.type === 'export') {
        useFonts(m.fonts);
        const r = last && last.code === m.code && last.lk === JSON.stringify(m.libs || {}) + (m.center ? 'C' : '') ? last.r : runCode(m.code, m.libs, m.center);
        const fail = (msg) => ({ reply: { type: 'export', id: m.id, error: msg }, transfer: [] });
        if (r.error) return fail(`O código tem um erro${r.error.line ? ' na linha ' + r.error.line : ''}. Corrija antes de exportar.`);
        if (m.format === 'stl' || m.format === 'obj') {
          if (!r.objects.some((o) => o.dim === 3)) return fail('Não há objetos 3D para exportar. Formas 2D precisam de linear_extrude() ou rotate_extrude().');
          if (m.format === 'stl') { const buf = E.toSTL(r.objects, m.name); return { reply: { type: 'export', id: m.id, data: buf }, transfer: [buf] }; }
          return { reply: { type: 'export', id: m.id, data: E.toOBJ(r.objects) }, transfer: [] };
        }
        if (m.format === 'svg') {
          if (!r.objects.some((o) => o.dim === 2)) return fail('Não há formas 2D para exportar em SVG. Para o contorno de uma peça 3D, use projection().');
          return { reply: { type: 'export', id: m.id, data: E.toSVG(r.objects) }, transfer: [] };
        }
        return fail('Formato desconhecido');
      }
      return { reply: { type: 'noop' }, transfer: [] };
    };
  }
  root.forjaHandler = forjaHandler;
})(typeof self !== 'undefined' ? self : this);
