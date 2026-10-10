const E = require('../js/engine.js');
const meshCheck = require('./mesh-check.js');

(async () => {
const wasm = await (await import('manifold-3d')).default();
wasm.setup();
E.setManifold(wasm);

const EX = require('../js/examples.js');
let bad = 0;
for (const ex of EX) {
  const r = E.run(ex.code);
  const b = r.objects.length ? E.bounds(r.objects).map(p => p.map(v => +v.toFixed(1))) : null;
  let tris = 0; for (const o of r.objects) tris += E.toTriangles(o).length / 9;
  const params = E.extractParams(ex.code, r.ast).map(p => p.name + (p.ann ? '*' : ''));
  console.log(`${ex.id.padEnd(11)} ${String(r.time).padStart(5)}ms objs=${r.objects.length} ghosts=${r.ghosts.length} tris=${tris} vol=${E.volume(r.objects).toFixed(0)} bb=${JSON.stringify(b)}`);
  console.log('            params:', params.join(' '));
  if (r.error) { bad++; console.log('   ERRO', r.error); }
  if (!r.objects.length) { bad++; console.log('   VAZIO'); }
  const stl = E.toSTL(r.objects, ex.id);
  if (stl) { const c = meshCheck(stl); const ruim = c.bad + c.degenerate; console.log('            STL:', c.triangles, 'triângulos,', ruim ? `${c.bad} arestas com problema e ${c.degenerate} triângulos degenerados` : 'malha fechada'); if (ruim) bad++; }
  r.dispose();
  for (const w of r.warnings) console.log('   aviso', w);
  for (const e of r.echoes) console.log('   ', e.msg);
}
if (bad) { console.log(bad + ' exemplos com problema'); process.exit(1); } else console.log('Exemplos OK');
})();
