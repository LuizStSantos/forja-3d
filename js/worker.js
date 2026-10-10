/* Forja 3D — roda o motor fora da página para a interface não travar */
importScripts('../vendor/jscad-modeling.min.js', '../vendor/clipper.js', 'engine.js', 'handler.js');

const handle = self.forjaHandler(self.ForjaEngine, 300000);

self.onmessage = (e) => {
  const m = e.data || {};
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
