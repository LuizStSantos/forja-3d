/* Forja 3D — roda o motor fora da página para a interface não travar */
importScripts('../vendor/jscad-modeling.min.js', '../vendor/clipper.js', '../vendor/opentype.min.js', 'engine.js', 'handler.js');

// motor 3D (Manifold, WebAssembly)
const ready = import(new URL('../vendor/manifold/manifold.js', self.location.href).href)
  .then((mod) => mod.default())
  .then((wasm) => { wasm.setup(); self.ForjaEngine.setManifold(wasm); });

const handle = self.forjaHandler(self.ForjaEngine, 300000);

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    await ready;
  } catch (err) {
    const msg = 'Não foi possível carregar o motor 3D: ' + ((err && err.message) || err);
    if (m.type === 'hello') self.postMessage({ type: 'hello', ok: false, error: msg });
    else if (m.type === 'export') self.postMessage({ type: 'export', id: m.id, error: msg });
    else self.postMessage({ type: 'result', id: m.id, meshes: [], echoes: [], warnings: [], error: { msg, line: null }, time: 0 });
    return;
  }
  if (m.type === 'hello') { self.postMessage({ type: 'hello', ok: true }); return; }
  let out;
  try {
    out = handle(m);
  } catch (err) {
    const msg = 'Falha interna: ' + ((err && err.message) || err);
    out = {
      reply: m.type === 'export'
        ? { type: 'export', id: m.id, error: msg }
        : { type: 'result', id: m.id, meshes: [], echoes: [], warnings: [], error: { msg, line: null }, time: 0 },
      transfer: [],
    };
  }
  self.postMessage(out.reply, out.transfer);
};
