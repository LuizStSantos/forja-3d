(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fatal(msg) {
    const d = document.createElement('div');
    d.className = 'fatal';
    d.innerHTML = '<div><b>Não foi possível abrir o Forja 3D</b><p></p></div>';
    d.querySelector('p').textContent = msg;
    document.body.appendChild(d);
  }
  if (!window.THREE || !THREE.OrbitControls || !window.CodeMirror || !CodeMirror.defineSimpleMode || !window.jscadModeling || !window.ClipperLib || !window.ForjaEngine || !window.forjaHandler) {
    fatal('Algumas bibliotecas não carregaram (visualização 3D, editor ou motor geométrico). Verifique a conexão e recarregue a página.');
    return;
  }
  const E = window.ForjaEngine;
  const EX = window.FORJA_EXAMPLES || [];

  // ───────── armazenamento local (rascunho deste navegador) ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('forja3d:' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('forja3d:' + k, v); } catch (e) { /* sem armazenamento */ } },
  };

  let toastT = 0;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 5200 : 3200);
  }

  // ───────── ícones ─────────
  const IC = {
    cube: '<path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7z M3 6.5l7 4 7-4 M10 10.5v7"/>',
    sphere: '<circle cx="10" cy="10" r="7"/><ellipse cx="10" cy="10" rx="7" ry="2.6"/>',
    cyl: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5"/>',
    cone: '<path d="M10 2.5 4 15M10 2.5 16 15"/><ellipse cx="10" cy="15" rx="6" ry="2.2"/>',
    tube: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><ellipse cx="10" cy="5" rx="3" ry="1.1"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5"/>',
    text: '<path d="M4 4.5h12M10 4.5v12"/>',
    square: '<rect x="3.5" y="5" width="13" height="10" rx=".5"/>',
    circle: '<circle cx="10" cy="10" r="6.5"/>',
    polygon: '<path d="M10 3 17 8.5 14.3 16.5H5.7L3 8.5z"/>',
    letter: '<path d="M5 16 10 4l5 12M7 12h6"/>',
    union: '<circle cx="7.5" cy="10" r="5" fill="currentColor" fill-opacity=".22"/><circle cx="12.5" cy="10" r="5" fill="currentColor" fill-opacity=".22"/>',
    diff: '<path d="M10 5.67A5 5 0 1 0 10 14.33A5 5 0 0 1 10 5.67z" fill="currentColor" fill-opacity=".3"/><circle cx="7.5" cy="10" r="5"/><circle cx="12.5" cy="10" r="5" stroke-dasharray="1.6 1.8"/>',
    inter: '<path d="M10 5.67A5 5 0 0 1 10 14.33A5 5 0 0 1 10 5.67z" fill="currentColor" fill-opacity=".45"/><circle cx="7.5" cy="10" r="5"/><circle cx="12.5" cy="10" r="5"/>',
    hull: '<circle cx="6" cy="12.5" r="3"/><circle cx="14" cy="7" r="2"/><path d="M3.6 10.7 12.7 5.5M7.6 15 15.5 8.4" stroke-dasharray="1.6 1.6"/>',
    move: '<path d="M10 2.5v15M2.5 10h15M7.8 4.7 10 2.5l2.2 2.2M7.8 15.3l2.2 2.2 2.2-2.2M4.7 7.8 2.5 10l2.2 2.2M15.3 7.8l2.2 2.2-2.2 2.2"/>',
    rotate: '<path d="M16.2 10.5a6.2 6.2 0 1 1-1.9-4.8"/><path d="M14.8 2.5v3.6h-3.6"/>',
    scale: '<rect x="3" y="9" width="8" height="8"/><path d="M10 3h7v7M17 3l-6.5 6.5"/>',
    mirror: '<path d="M10 2.5v15" stroke-dasharray="1.8 1.8"/><path d="M7.5 5 3 15h4.5zM12.5 5 17 15h-4.5z"/>',
    color: '<path d="M10 2.5s-5.5 6.2-5.5 9.7a5.5 5.5 0 0 0 11 0c0-3.5-5.5-9.7-5.5-9.7z"/>',
    repeat: '<rect x="2.5" y="7" width="4" height="6"/><rect x="8" y="7" width="4" height="6"/><rect x="13.5" y="7" width="4" height="6"/>',
    extrude: '<path d="M3 15.5h10l4-3H7z"/><path d="M10 11V3M7.5 5.5 10 3l2.5 2.5"/>',
    revolve: '<ellipse cx="10" cy="14" rx="7" ry="2.5"/><path d="M10 14V3.5c2.5 0 3.5 2 3.5 4.5s-1 6-3.5 6"/>',
    offset: '<rect x="6.5" y="6.5" width="7" height="7"/><rect x="3" y="3" width="14" height="14" rx="3" stroke-dasharray="2 1.6"/>',
    twist: '<path d="M5 17h10M5 3h10M6 17c0-5 8-5 8-14M14 17c0-5-8-5-8-14"/>',
  };
  const icon = (k) => `<svg class="i" viewBox="0 0 20 20" aria-hidden="true">${IC[k] || ''}</svg>`;

  // ───────── bandeja de ferramentas ─────────
  const TOOLS = [
    { id: 'f3', label: 'Formas 3D', hint: 'Insere na linha do cursor', items: [
      { label: 'Cubo', ic: 'cube', kind: 'shape', code: 'cube([20, 20, 20]);', tip: 'Caixa: [largura, profundidade, altura]' },
      { label: 'Esfera', ic: 'sphere', kind: 'shape', code: 'sphere(r = 10, $fn = 48);', tip: 'Esfera de raio r' },
      { label: 'Cilindro', ic: 'cyl', kind: 'shape', code: 'cylinder(h = 20, r = 8, $fn = 48);', tip: 'Cilindro de altura h e raio r' },
      { label: 'Cone', ic: 'cone', kind: 'shape', code: 'cylinder(h = 20, r1 = 10, r2 = 0, $fn = 48);', tip: 'Cilindro com raio de cima (r2) zero' },
      { label: 'Tubo', ic: 'tube', kind: 'shape', code: 'difference() {\n  cylinder(h = 20, r = 10, $fn = 48);\n  translate([0, 0, -1]) cylinder(h = 22, r = 8, $fn = 48);\n}', tip: 'Cilindro com furo' },
      { label: 'Texto 3D', ic: 'text', kind: 'shape', code: 'linear_extrude(3) text("Olá", size = 10);', tip: 'Texto com 3 mm de altura' },
    ] },
    { id: 'f2', label: 'Formas 2D', hint: 'Desenhos planos; use 2D → 3D para dar volume', items: [
      { label: 'Retângulo', ic: 'square', kind: 'shape', code: 'square([20, 10]);' },
      { label: 'Círculo', ic: 'circle', kind: 'shape', code: 'circle(r = 10, $fn = 48);' },
      { label: 'Polígono', ic: 'polygon', kind: 'shape', code: 'polygon([[0, 0], [20, 0], [10, 15]]);', tip: 'Lista de pontos [x, y]' },
      { label: 'Texto', ic: 'letter', kind: 'shape', code: 'text("Olá", size = 10);' },
    ] },
    { id: 'cb', label: 'Combinar', hint: 'Selecione as linhas das formas e clique', items: [
      { label: 'Diferença', ic: 'diff', kind: 'block', head: 'difference()', note: '// tudo depois da primeira forma é removido', sample: 'cube([30, 30, 10]);\n  translate([15, 15, -1]) cylinder(h = 12, r = 6, $fn = 48);', tip: 'Fura: a primeira forma menos as outras' },
      { label: 'União', ic: 'union', kind: 'block', head: 'union()', note: '// adicione mais formas aqui', sample: 'cube([20, 20, 10]);\n  translate([10, 10, 10]) sphere(r = 8, $fn = 48);', tip: 'Junta as formas num objeto só' },
      { label: 'Interseção', ic: 'inter', kind: 'block', head: 'intersection()', note: '// fica só o que for comum', sample: 'cube(20, center = true);\n  sphere(r = 13, $fn = 64);', tip: 'Mantém apenas a parte em comum' },
      { label: 'Envoltória', ic: 'hull', kind: 'block', head: 'hull()', note: '// adicione mais formas aqui', sample: 'cylinder(h = 4, r = 5, $fn = 48);\n  translate([30, 0, 0]) cylinder(h = 4, r = 3, $fn = 48);', tip: 'Embrulha as formas como um elástico' },
    ] },
    { id: 'ps', label: 'Posicionar', hint: 'Coloque o cursor numa forma (ou selecione várias) e clique', items: [
      { label: 'Mover', ic: 'move', kind: 'prefix', head: 'translate([10, 0, 0])', sample: 'cube(10);', tip: 'translate([x, y, z])' },
      { label: 'Girar', ic: 'rotate', kind: 'prefix', head: 'rotate([0, 0, 45])', sample: 'cube([20, 5, 5]);', tip: 'rotate([x, y, z]) em graus' },
      { label: 'Escalar', ic: 'scale', kind: 'prefix', head: 'scale([1.5, 1, 1])', sample: 'sphere(r = 10, $fn = 48);', tip: 'Multiplica as medidas' },
      { label: 'Espelhar', ic: 'mirror', kind: 'prefix', head: 'mirror([1, 0, 0])', sample: 'translate([10, 0, 0]) cube(5);', tip: 'Reflete do outro lado de um plano' },
      { label: 'Cor', ic: 'color', kind: 'prefix', head: 'color("vermelho")', sample: 'cube(10);', tip: 'Nome, "#hex" ou [r, g, b]' },
      { label: 'Repetir', ic: 'repeat', kind: 'prefix', head: 'for (i = [0 : 4]) translate([i * 25, 0, 0])', sample: 'cube(10);', tip: 'Repete 5 vezes, a cada 25 mm' },
    ] },
    { id: 'ex', label: '2D → 3D', hint: 'Aplicado a formas 2D', items: [
      { label: 'Extrudar', ic: 'extrude', kind: 'prefix', head: 'linear_extrude(height = 10)', sample: 'square([20, 10]);', tip: 'Puxa o desenho para cima' },
      { label: 'Torcer', ic: 'twist', kind: 'prefix', head: 'linear_extrude(height = 40, twist = 90, slices = 30)', sample: 'square(15, center = true);', tip: 'Extrusão com torção' },
      { label: 'Revolver', ic: 'revolve', kind: 'prefix', head: 'rotate_extrude($fn = 64)', sample: 'translate([15, 0]) circle(r = 4, $fn = 32);', tip: 'Gira o perfil em volta do eixo Z' },
      { label: 'Contornar', ic: 'offset', kind: 'prefix', head: 'offset(r = 2)', sample: 'square([20, 10]);', tip: 'Engrossa ou afina o desenho' },
    ] },
  ];

  // ───────── documentação para sugestões ─────────
  const DOCS = {
    cube: ['cube([10, 10, 10])', 'caixa [x, y, z]; center = true centraliza'],
    sphere: ['sphere(r = 10)', 'esfera de raio r (ou diâmetro d)'],
    cylinder: ['cylinder(h = 20, r = 5)', 'cilindro; r1 ≠ r2 faz cone'],
    polyhedron: ['polyhedron(points = [], faces = [])', 'sólido por pontos e faces'],
    square: ['square([10, 10])', 'retângulo 2D'],
    circle: ['circle(r = 10)', 'círculo 2D'],
    polygon: ['polygon([[0, 0], [10, 0], [5, 8]])', 'polígono 2D por pontos'],
    text: ['text("Olá", size = 10)', 'texto 2D'],
    translate: ['translate([0, 0, 0])', 'move os filhos'],
    rotate: ['rotate([0, 0, 0])', 'gira em graus (X, Y, Z)'],
    scale: ['scale([1, 1, 1])', 'escala os filhos'],
    mirror: ['mirror([1, 0, 0])', 'espelha'],
    multmatrix: ['multmatrix(m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])', 'matriz de transformação'],
    resize: ['resize([20, 0, 0], auto = true)', 'medidas exatas'],
    color: ['color("vermelho")', 'cor por nome, #hex ou [r, g, b, a]'],
    offset: ['offset(r = 2)', 'contorno de formas 2D'],
    union: ['union()', 'junta os filhos'],
    difference: ['difference()', 'primeiro filho menos os outros'],
    intersection: ['intersection()', 'parte em comum'],
    hull: ['hull()', 'envoltória convexa'],
    minkowski: ['minkowski()', 'soma de Minkowski (arredondar)'],
    linear_extrude: ['linear_extrude(height = 10)', '2D → 3D para cima'],
    rotate_extrude: ['rotate_extrude($fn = 64)', '2D → 3D girando em Z'],
    projection: ['projection()', 'sombra 2D de um sólido'],
    render: ['render()', 'sem efeito aqui (compatibilidade)'],
    children: ['children()', 'desenha os filhos do módulo'],
    echo: ['echo()', 'mostra valores no Console'],
    assert: ['assert(condicao, "mensagem")', 'para com erro se for falso'],
  };
  const FDOCS = {
    sin: 'seno (graus)', cos: 'cosseno (graus)', tan: 'tangente (graus)', asin: 'arco-seno', acos: 'arco-cosseno', atan: 'arco-tangente', atan2: 'ângulo de (y, x)',
    abs: 'valor absoluto', sign: 'sinal (-1, 0, 1)', floor: 'arredonda para baixo', ceil: 'arredonda para cima', round: 'arredonda', sqrt: 'raiz quadrada', pow: 'potência', exp: 'e^x', ln: 'logaritmo natural', log: 'logaritmo base 10',
    min: 'menor valor', max: 'maior valor', norm: 'comprimento de um vetor', cross: 'produto vetorial', len: 'tamanho de lista/texto', concat: 'junta listas', lookup: 'interpolação em tabela',
    str: 'converte para texto', chr: 'código → caractere', ord: 'caractere → código', search: 'procura em lista/texto', rands: 'números aleatórios',
    is_undef: 'é indefinido?', is_num: 'é número?', is_bool: 'é verdadeiro/falso?', is_string: 'é texto?', is_list: 'é lista?', is_function: 'é função?', version: 'versão da linguagem', version_num: 'versão (número)',
  };
  const SPECIAL = { $fn: 'número de lados dos círculos', $fa: 'ângulo mínimo por lado', $fs: 'tamanho mínimo por lado', $t: 'tempo da animação (0 a 1)', $preview: 'true na pré-visualização', $children: 'quantidade de filhos' };
  const KEYWORD_SNIPS = {
    for: ['for (i = [0 : 4]) ', 'repete para cada valor'],
    if: ['if (condicao) ', 'executa se for verdadeiro'],
    module: ['module nome() {\n  \n}', 'cria uma peça reutilizável'],
    function: ['function nome(x) = x * 2;', 'cria uma função'],
    let: ['let (a = 1) ', 'variáveis locais'],
  };
  const ALIAS_NAMES = Object.keys(E.ALIASES);

  // ───────── editor ─────────
  const modRe = '\\b(?:' + E.BUILTIN_MODS.concat(ALIAS_NAMES, ['children', 'echo', 'assert']).join('|') + ')\\b(?=\\s*\\()';
  const fnRe = '\\b(?:' + E.BUILTIN_FUNCS.join('|') + ')\\b(?=\\s*\\()';
  CodeMirror.defineSimpleMode('openscad', {
    start: [
      { regex: /\/\/.*/, token: 'comment' },
      { regex: /\/\*/, token: 'comment', next: 'comment' },
      { regex: /"(?:[^\\"]|\\.)*?(?:"|$)/, token: 'string' },
      { regex: /\b(module|function)(\s+)([A-Za-z_]\w*)/, token: ['keyword', null, 'def'] },
      { regex: /\b(?:module|function|if|else|for|let|each|include|use|intersection_for)\b/, token: 'keyword' },
      { regex: /\b(?:true|false|undef|PI)\b/, token: 'atom' },
      { regex: new RegExp(modRe), token: 'builtin' },
      { regex: new RegExp(fnRe), token: 'variable-3' },
      { regex: /\$[A-Za-z_]\w*/, token: 'variable-2' },
      { regex: /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/, token: 'number' },
      { regex: /#(?=\s*[A-Za-z_])/, token: 'meta' },
      { regex: /\s*[%!*](?=\s*[A-Za-z_])/, token: 'meta', sol: true },
      { regex: /[-+/*=<>!&|?:%^]+/, token: 'operator' },
      { regex: /[A-Za-z_]\w*/, token: 'variable' },
      { regex: /[{[(]/, indent: true },
      { regex: /[}\])]/, dedent: true },
    ],
    comment: [{ regex: /.*?\*\//, token: 'comment', next: 'start' }, { regex: /.*/, token: 'comment' }],
    meta: { lineComment: '//', blockCommentStart: '/*', blockCommentEnd: '*/', electricChars: '}])', dontIndentStates: ['comment'] },
  });

  const initialCode = store.get('code', null) || (EX[0] ? EX[0].code : 'cube(10);\n');
  const projName = $('#projName');
  projName.value = store.get('name', EX[0] ? EX[0].id : 'modelo');

  const cm = CodeMirror($('#editor'), {
    value: initialCode,
    mode: 'openscad',
    lineNumbers: true,
    gutters: ['forja-marks', 'CodeMirror-linenumbers'],
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    viewportMargin: 60,
    extraKeys: {
      Tab: (c) => { if (c.somethingSelected()) c.indentSelection('add'); else c.replaceSelection('  '); },
      'Shift-Tab': (c) => c.indentSelection('subtract'),
      'Ctrl-Enter': () => renderNow(), 'Cmd-Enter': () => renderNow(), F5: () => renderNow(),
      'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
      'Ctrl-Space': (c) => c.showHint({ hint: forjaHint, completeSingle: false }),
      'Ctrl-S': () => saveDraftNow(true), 'Cmd-S': () => saveDraftNow(true),
    },
  });

  function flashLines(a, b) {
    for (let l = a; l <= b; l++) cm.addLineClass(l, 'background', 'cm-flash');
    setTimeout(() => { for (let l = a; l <= Math.min(b, cm.lastLine()); l++) cm.removeLineClass(l, 'background', 'cm-flash'); }, 1500);
  }
  function jumpToLine(line) {
    if (!line) return;
    const l = clamp(line - 1, 0, cm.lastLine());
    if (isMobile()) setPane('code');
    cm.focus();
    cm.setCursor({ line: l, ch: cm.getLine(l).search(/\S|$/) });
    cm.scrollIntoView({ line: l, ch: 0 }, 120);
    flashLines(l, l);
  }

  cm.on('cursorActivity', () => {
    const c = cm.getCursor();
    $('#cursorPos').textContent = `Linha ${c.line + 1}, coluna ${c.ch + 1} · ${cm.lineCount()} linhas`;
  });

  // ── sugestões ──
  let userSymbols = { mods: [], funcs: [], vars: [] };
  function forjaHint(c) {
    const cur = c.getCursor();
    const line = c.getLine(cur.line).slice(0, cur.ch);
    const m = line.match(/[$A-Za-z_][\w]*$/);
    const word = m ? m[0] : '';
    const from = { line: cur.line, ch: cur.ch - word.length };
    const w = word.toLowerCase();
    const list = [];
    const push = (text, apply, desc, kind) => {
      if (!w || text.toLowerCase().startsWith(w)) list.push({ text: apply, displayText: text, desc, kind, render: renderHint, hint: applyHint });
    };
    for (const k of Object.keys(KEYWORD_SNIPS)) push(k, KEYWORD_SNIPS[k][0], KEYWORD_SNIPS[k][1], 'kw');
    for (const k of Object.keys(DOCS)) push(k, DOCS[k][0], DOCS[k][1], 'mod');
    for (const k of userSymbols.mods) push(k, k + '()', 'seu módulo', 'fn');
    for (const k of Object.keys(FDOCS)) push(k, k + '()', FDOCS[k], 'fn');
    for (const k of userSymbols.funcs) push(k, k + '()', 'sua função', 'fn');
    for (const k of Object.keys(SPECIAL)) push(k, k, SPECIAL[k], 'var');
    for (const k of userSymbols.vars) push(k, k, 'variável', 'var');
    for (const k of ALIAS_NAMES) push(k, DOCS[E.ALIASES[k]] ? DOCS[E.ALIASES[k]][0].replace(/^\w+/, k) : k + '()', 'atalho para ' + E.ALIASES[k], 'mod');
    for (const k of ['true', 'false', 'undef', 'PI']) push(k, k, 'constante', 'var');
    if (!list.length) return null;
    list.sort((a, b) => (a.displayText.toLowerCase() === w ? -1 : 0) - (b.displayText.toLowerCase() === w ? -1 : 0));
    return { list: list.slice(0, 40), from, to: cur };
  }
  function renderHint(el, self, d) {
    const b = document.createElement('b'); b.textContent = d.displayText;
    const s = document.createElement('small'); s.textContent = d.desc || '';
    el.appendChild(b); el.appendChild(s);
  }
  function applyHint(c, data, d) {
    const text = d.text;
    const ind = (c.getLine(data.from.line).match(/^\s*/) || [''])[0];
    c.replaceRange(text.replace(/\n/g, '\n' + ind), data.from, data.to, 'complete');
    if (/\(\)$/.test(text)) { const p = c.getCursor(); c.setCursor({ line: p.line, ch: p.ch - 1 }); }
  }
  cm.on('inputRead', (c, ch) => {
    if (ch.origin !== '+input' || !/^[$A-Za-z_]$/.test(ch.text[0] || '')) return;
    const cur = c.getCursor();
    const tok = c.getTokenAt(cur);
    if (tok.type && /comment|string/.test(tok.type)) return;
    const before = c.getLine(cur.line).slice(0, cur.ch).match(/[$A-Za-z_]\w*$/);
    if (before && before[0].length >= 2 && !c.state.completionActive) c.showHint({ hint: forjaHint, completeSingle: false });
  });

  // ── inserção pela bandeja ──
  const lineIndent = (l) => (cm.getLine(l).match(/^\s*/) || [''])[0];
  const isInstLine = (t) => /^\s*[#%!*]?\s*[A-Za-z_]\w*\s*\(/.test(t) && !/^\s*(module|function|if|else|let)\b/.test(t);

  function insertCode(code) {
    const cur = cm.getCursor();
    const lt = cm.getLine(cur.line);
    let ind, text, startLine;
    if (lt.trim() === '') {
      ind = lt;
      text = code.split('\n').join('\n' + ind);
      startLine = cur.line;
    } else {
      ind = lineIndent(cur.line) + (/\{\s*$/.test(lt) ? '  ' : '');
      text = '\n' + ind + code.split('\n').join('\n' + ind);
      startLine = cur.line + 1;
    }
    cm.replaceRange(text, { line: cur.line, ch: lt.length }, undefined, '+tool');
    const endLine = startLine + code.split('\n').length - 1;
    cm.setCursor({ line: endLine, ch: cm.getLine(endLine).length });
    flashLines(startLine, endLine);
  }
  function wrapLines(a, b, head, note) {
    const ind = lineIndent(a);
    const lines = [];
    for (let l = a; l <= b; l++) lines.push(cm.getLine(l));
    const body = lines.map((l) => (l.trim() ? '  ' + l : l));
    if (note) body.push(ind + '  ' + note);
    const out = ind + head + ' {\n' + body.join('\n') + '\n' + ind + '}';
    cm.replaceRange(out, { line: a, ch: 0 }, { line: b, ch: cm.getLine(b).length }, '+tool');
    flashLines(a, b + (note ? 2 : 1) + 1);
    cm.setCursor({ line: a, ch: ind.length });
  }
  function applyTool(t) {
    if (t.kind === 'shape') { insertCode(t.code); return afterTool(); }
    if (cm.somethingSelected()) {
      const f = cm.getCursor('from'), to = cm.getCursor('to');
      let b = to.line;
      if (to.ch === 0 && b > f.line) b--;
      wrapLines(f.line, b, t.head, t.kind === 'block' ? t.note : null);
      return afterTool();
    }
    const cur = cm.getCursor();
    const lt = cm.getLine(cur.line);
    if (isInstLine(lt)) {
      if (t.kind === 'prefix') {
        const at = lineIndent(cur.line).length;
        cm.replaceRange(t.head + ' ', { line: cur.line, ch: at }, undefined, '+tool');
        flashLines(cur.line, cur.line);
      } else if (/;\s*(\/\/.*)?$/.test(lt)) {
        wrapLines(cur.line, cur.line, t.head, t.note);
      } else insertCode(t.head + ' {\n  ' + t.sample + '\n}');
    } else {
      insertCode(t.kind === 'prefix' ? t.head + ' ' + t.sample : t.head + ' {\n  ' + t.sample + '\n}');
    }
    afterTool();
  }
  function afterTool() { cm.focus(); requestRender(250); }

  let trayGroup = store.get('tray', 'f3');
  function buildTray() {
    const tabs = $('#trayTabs');
    tabs.innerHTML = '';
    if (!TOOLS.some((g) => g.id === trayGroup)) trayGroup = TOOLS[0].id;
    for (const g of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.textContent = g.label;
      b.setAttribute('aria-selected', String(g.id === trayGroup));
      b.addEventListener('click', () => { trayGroup = g.id; store.set('tray', g.id); buildTray(); });
      tabs.appendChild(b);
    }
    const chips = $('#chips');
    chips.innerHTML = '';
    const grp = TOOLS.find((g) => g.id === trayGroup);
    for (const t of grp.items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.innerHTML = icon(t.ic) + '<span></span>';
      b.querySelector('span').textContent = t.label;
      b.title = (t.tip ? t.tip + '\n' : '') + (t.kind === 'shape' ? t.code.split('\n')[0] : t.head);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => applyTool(t));
      chips.appendChild(b);
    }
    const h = document.createElement('span');
    h.className = 'tray-hint';
    h.textContent = grp.hint;
    h.style.alignSelf = 'center';
    chips.appendChild(h);
  }

  // ───────── visualização 3D ─────────
  const viewer = (() => {
    const mat = $('#mat');
    const canvas = $('#view');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.autoClear = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
    camera.up.set(0, 0, 1);
    camera.position.set(120, -150, 110);
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = !reduceMotion;
    controls.dampingFactor = 0.14;
    controls.screenSpacePanning = true;
    controls.zoomSpeed = 1.1;
    controls.rotateSpeed = 0.75;
    controls.enableZoom = false; // o zoom é feito abaixo, em direção ao cursor
    scene.add(new THREE.HemisphereLight(0xffffff, 0x77827d, 0.58));
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    const key = new THREE.DirectionalLight(0xffffff, 0.78);
    key.position.set(0.6, 0.8, 1);
    camera.add(key);
    scene.add(camera);
    const rim = new THREE.DirectionalLight(0xffffff, 0.22);
    rim.position.set(-1, 1.2, -0.6);
    scene.add(rim);

    const modelGroup = new THREE.Group(), ghostGroup = new THREE.Group(), gridGroup = new THREE.Group();
    scene.add(gridGroup, modelGroup, ghostGroup);
    let edgesOn = store.get('edges', '0') === '1', gridOn = store.get('grid', '1') === '1';
    let needs = true, lastMeshes = [], gridSize = 0;
    let mBox = new THREE.Box3(), pivotCustom = false;

    // gizmo dos eixos
    const gScene = new THREE.Scene();
    const gCam = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);
    gCam.up.set(0, 0, 1);
    const AX = [[1, 0, 0, '#e5534b', 'X'], [0, 1, 0, '#4cbf6f', 'Y'], [0, 0, 1, '#4f8ef7', 'Z']];
    for (const [x, y, z, col, lbl] of AX) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)]);
      gScene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col })));
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const cx = cv.getContext('2d');
      cx.fillStyle = col; cx.beginPath(); cx.arc(32, 32, 26, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#fff'; cx.font = '700 34px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(lbl, 32, 34);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
      sp.position.set(x * 1.25, y * 1.25, z * 1.25); sp.scale.set(0.62, 0.62, 0.62);
      gScene.add(sp);
    }

    function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
    function themeColors() { return { mat: css('--mat'), line: css('--mat-line'), major: css('--mat-major'), model: css('--model') }; }
    let colors = themeColors();

    function buildGrid(half) {
      for (const c of gridGroup.children) { c.geometry.dispose(); c.material.dispose(); }
      gridGroup.clear();
      const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      const minor = steps.find((s) => half / s <= 30) || 5000;
      const major = minor * (String(minor)[0] === '1' ? 10 : 5);
      const ext = Math.ceil(half / major) * major;
      const mn = [], mj = [];
      for (let v = -ext; v <= ext + 1e-9; v += minor) {
        const arr = Math.abs(Math.round(v / major) * major - v) < 1e-6 ? mj : mn;
        arr.push(-ext, v, 0, ext, v, 0, v, -ext, 0, v, ext, 0);
      }
      const mk = (pts, col, op) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
      };
      gridGroup.add(mk(mn, colors.line, 0.55), mk(mj, colors.major, 0.7));
      const ax = (x, y, z, col) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, x * ext, y * ext, z * ext], 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
      };
      gridGroup.add(ax(1, 0, 0, '#ef6a5f'), ax(0, 1, 0, '#6fd08f'), ax(0, 0, 0.5, '#77a9ff'));
      gridGroup.children.forEach((c) => { c.renderOrder = -1; });
      gridGroup.visible = gridOn;
      gridSize = half;
    }

    function colorOf(m) {
      if (m.ghost === 'hl') return { c: new THREE.Color('#ff4f7b'), a: 0.32 };
      if (m.ghost === 'bg') return { c: new THREE.Color('#b9c4bf'), a: 0.16 };
      if (m.color) return { c: new THREE.Color(m.color[0], m.color[1], m.color[2]), a: m.color[3] };
      return { c: new THREE.Color(colors.model), a: m.dim === 2 ? 0.92 : 1 };
    }

    function setMeshes(meshes) {
      lastMeshes = meshes;
      for (const g of [modelGroup, ghostGroup]) {
        for (const c of g.children) { c.geometry.dispose(); c.material.dispose(); }
        g.clear();
      }
      for (const m of meshes) {
        if (!m.pos || !m.pos.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
        geo.computeVertexNormals();
        const { c, a } = colorOf(m);
        const ghost = !!m.ghost;
        const matl = new THREE.MeshStandardMaterial({
          color: c, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide,
          transparent: a < 1, opacity: a, depthWrite: !ghost && a >= 1,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        });
        const mesh = new THREE.Mesh(geo, matl);
        mesh.userData = { line: m.line, ghost: m.ghost };
        (ghost ? ghostGroup : modelGroup).add(mesh);
        if (edgesOn && !ghost) {
          const eg = new THREE.EdgesGeometry(geo, 24);
          const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x0d1612, transparent: true, opacity: 0.45 }));
          lines.userData.edge = true;
          modelGroup.add(lines);
        }
      }
      const b = boundsBox();
      mBox = b.clone();
      const half = b.isEmpty() ? 50 : Math.max(40, Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y)) * 1.4, (b.max.z - b.min.z) * 0.6);
      if (!gridSize || half > gridSize * 1.6 || half < gridSize / 2.5) buildGrid(half);
      needs = true;
    }

    function boundsBox() {
      const box = new THREE.Box3();
      for (const c of modelGroup.children) if (c.isMesh) box.expandByObject(c);
      if (box.isEmpty()) for (const c of ghostGroup.children) if (c.isMesh) box.expandByObject(c);
      return box;
    }

    let anim = null;
    function moveCamera(pos, target) {
      if (reduceMotion) { camera.position.copy(pos); controls.target.copy(target); needs = true; return; }
      anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: 380 };
    }
    const DIRS = {
      iso: [1, -1.3, 0.95], top: [0, -0.0001, 1], front: [0, -1, 0.0001], right: [1, 0, 0.0001],
      bottom: [0, -0.0001, -1], back: [0, 1, 0.0001], left: [-1, 0, 0.0001],
    };
    const OPPOSITE = { top: 'bottom', front: 'back', right: 'left', bottom: 'top', back: 'front', left: 'right' };
    let lastDir = 'iso';
    // distância mínima para a caixa da peça caber inteira na tela olhando por esta direção
    function fitDistance(box, dir) {
      const c = box.getCenter(new THREE.Vector3());
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * camera.aspect;
      let d = 0;
      for (let i = 0; i < 8; i++) {
        const q = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
        const depth = -q.dot(fwd); // positivo = mais perto da câmera
        d = Math.max(d, depth + Math.max(Math.abs(q.dot(right)) / th, Math.abs(q.dot(up)) / tv));
      }
      return d;
    }
    function fit(dirName, animate = true) {
      if (dirName) {
        // apertar de novo a mesma vista mostra o lado oposto (frente → trás, topo → baixo, lado → outro lado)
        if (dirName === lastDir && OPPOSITE[dirName] && animate) {
          const cur = camera.position.clone().sub(controls.target).normalize();
          if (cur.dot(new THREE.Vector3(...DIRS[dirName]).normalize()) > 0.98) dirName = OPPOSITE[dirName];
        }
        lastDir = dirName;
      }
      pivotCustom = false;
      const box = boundsBox();
      if (box.isEmpty()) box.set(new THREE.Vector3(-20, -20, 0), new THREE.Vector3(20, 20, 20));
      let dir;
      if (dirName) dir = new THREE.Vector3(...DIRS[dirName]).normalize();
      else dir = camera.position.clone().sub(controls.target).normalize();
      const dist = Math.max(fitDistance(box, dir) * 1.18, 1);
      const target = box.getCenter(new THREE.Vector3());
      const pos = target.clone().add(dir.multiplyScalar(dist));
      if (animate) moveCamera(pos, target);
      else { camera.position.copy(pos); controls.target.copy(target); needs = true; }
    }
    // planos de corte seguem a peça: nem cortam ao chegar perto, nem perdem precisão de longe
    function updateClip() {
      const sph = mBox.isEmpty() ? null : mBox.getBoundingSphere(new THREE.Sphere());
      const c = sph ? sph.center : controls.target, r = sph ? Math.max(sph.radius, 1) : 50;
      const d = camera.position.distanceTo(c);
      const near = Math.max(Math.min(d - r * 1.2, d * 0.5), 0.02) * 0.5 + 0.01;
      const far = Math.max(d + r * 3, gridSize * 8, 1000);
      if (Math.abs(camera.near - near) > near * 0.02 || Math.abs(camera.far - far) > far * 0.02) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); needs = true; }
    }
    // gira em volta do ponto de foco (graus)
    function orbitBy(dTheta, dPhi) {
      anim = null;
      const off = camera.position.clone().sub(controls.target);
      const sp = new THREE.Spherical().setFromVector3(new THREE.Vector3(off.x, off.z, -off.y)); // eixo Y do three = Z daqui
      sp.theta -= (dTheta * Math.PI) / 180;
      sp.phi = Math.min(Math.max(sp.phi - (dPhi * Math.PI) / 180, 0.01), Math.PI - 0.01);
      const v = new THREE.Vector3().setFromSpherical(sp);
      camera.position.set(controls.target.x + v.x, controls.target.y - v.z, controls.target.z + v.y);
      needs = true;
    }
    function panBy(dx, dy) {
      anim = null;
      const dist = camera.position.distanceTo(controls.target);
      const k = (dist * Math.tan((camera.fov * Math.PI) / 360) * 2) / Math.max(canvas.clientHeight, 1);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const d = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
      camera.position.add(d); controls.target.add(d); needs = true;
    }
    function zoomBy(f) {
      anim = null;
      const dist = camera.position.distanceTo(controls.target);
      const nd = Math.min(Math.max(dist * f, 0.2), camera.far / 4);
      camera.position.sub(controls.target).setLength(nd).add(controls.target);
      needs = true;
    }

    function resize() {
      const w = mat.clientWidth, h = mat.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      needs = true;
    }
    new ResizeObserver(resize).observe(mat);

    function draw() {
      const w = mat.clientWidth, h = mat.clientHeight;
      if (!w || !h) return;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.setClearColor(colors.mat, 1);
      renderer.clear();
      renderer.render(scene, camera);
      // gizmo
      const s = Math.round(Math.min(92, Math.max(64, Math.min(w, h) * 0.18)));
      renderer.setScissorTest(true);
      renderer.setViewport(4, 4, s, s);
      renderer.setScissor(4, 4, s, s);
      renderer.clearDepth();
      const d = camera.position.clone().sub(controls.target).normalize().multiplyScalar(4);
      gCam.position.copy(d);
      gCam.lookAt(0, 0, 0);
      renderer.render(gScene, gCam);
      renderer.setScissorTest(false);
    }

    controls.addEventListener('change', () => { needs = true; });
    function loop(now) {
      requestAnimationFrame(loop);
      if (anim) {
        let t = Math.min(1, (now - anim.start) / anim.dur);
        const e = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(anim.p0, anim.p1, e);
        controls.target.lerpVectors(anim.t0, anim.t1, e);
        needs = true;
        if (t >= 1) anim = null;
      }
      controls.update();
      updateClip();
      if (needs) { needs = false; draw(); }
    }
    requestAnimationFrame(loop);

    // seleção e dica de linha
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tip = $('#pickTip');
    let hovered = null;
    function pickAt(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const objs = modelGroup.children.filter((c) => c.isMesh).concat(ghostGroup.children.filter((c) => c.isMesh && c.userData.ghost === 'hl'));
      const hit = ray.intersectObjects(objs, false)[0];
      return hit ? hit.object : null;
    }
    function setHover(obj, ev) {
      if (hovered && hovered !== obj && hovered.material.emissive) hovered.material.emissive.setHex(0x000000);
      hovered = obj;
      if (obj && obj.material.emissive) obj.material.emissive.setHex(0x2a2a1a);
      canvas.style.cursor = obj ? 'pointer' : '';
      if (obj && obj.userData.line && ev) {
        const r = mat.getBoundingClientRect();
        tip.hidden = false;
        tip.textContent = `Linha ${obj.userData.line} · clique para ver o código`;
        tip.style.left = Math.min(ev.clientX - r.left, r.width - 230) + 'px';
        tip.style.top = (ev.clientY - r.top) + 'px';
      } else tip.hidden = true;
      needs = true;
    }
    let down = null, hoverRaf = 0;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; anim = null; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const obj = pickAt(e.clientX, e.clientY);
      if (obj && obj.userData.line) jumpToLine(obj.userData.line);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) { if (hovered) setHover(null); return; }
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; setHover(pickAt(e.clientX, e.clientY), e); });
    });
    canvas.addEventListener('pointerleave', () => setHover(null));
    // zoom em direção ao ponto sob o cursor (roda do mouse ou pinça do touchpad)
    const GROUND = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    function pointUnder(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(modelGroup.children.filter((c) => c.isMesh), false)[0];
      if (hit) return hit.point.clone();
      const dist = camera.position.distanceTo(controls.target);
      const g = ray.ray.intersectPlane(GROUND, new THREE.Vector3());
      if (g && g.distanceTo(camera.position) < dist * 8) return g;
      return ray.ray.at(dist, new THREE.Vector3());
    }
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      anim = null;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 120;
      if (e.ctrlKey) dy *= 3; // pinça no touchpad
      let f = Math.exp(Math.max(-120, Math.min(120, dy)) * 0.0012 * controls.zoomSpeed);
      const dist = camera.position.distanceTo(controls.target);
      const minD = 0.2, maxD = camera.far / 4;
      f = Math.min(Math.max(f, minD / dist), maxD / dist);
      const p = pointUnder(e.clientX, e.clientY);
      camera.position.sub(p).multiplyScalar(f).add(p);
      controls.target.sub(p).multiplyScalar(f).add(p);
      if (!pivotCustom && !mBox.isEmpty()) {
        // o foco do giro volta para a linha de visada, na profundidade da peça (a peça não "foge" ao girar)
        const fwd = controls.target.clone().sub(camera.position).normalize();
        const t = mBox.getCenter(new THREE.Vector3()).sub(camera.position).dot(fwd);
        if (t > 0.05) controls.target.copy(camera.position).addScaledVector(fwd, t);
      }
      needs = true;
    }, { passive: false });
    // duplo clique: gira em torno do ponto tocado; no vazio, enquadra a peça
    canvas.addEventListener('dblclick', (e) => {
      ndc.set(((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1, -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(modelGroup.children.filter((c) => c.isMesh), false)[0];
      if (h) { pivotCustom = true; moveCamera(camera.position.clone().add(h.point.clone().sub(controls.target)), h.point.clone()); }
      else fit(null);
    });

    function setEdges(on) { edgesOn = on; store.set('edges', on ? '1' : '0'); setMeshes(lastMeshes); }
    function setGrid(on) { gridOn = on; store.set('grid', on ? '1' : '0'); gridGroup.visible = on; needs = true; }
    function applyTheme() { colors = themeColors(); buildGrid(gridSize || 50); setMeshes(lastMeshes); }
    function snapshot() { draw(); return new Promise((res) => canvas.toBlob(res, 'image/png')); }

    resize();
    buildGrid(50);
    return { setMeshes, fit, resize, orbitBy, panBy, zoomBy, hideHint() { const h = $('#navhint'); if (h) h.hidden = true; }, setEdges, setGrid, applyTheme, snapshot, get edges() { return edgesOn; }, get grid() { return gridOn; }, redraw() { needs = true; } };
  })();

  // ───────── fontes e bibliotecas (recursos do usuário) ─────────
  const res = {
    libs: (() => { try { return JSON.parse(store.get('libs', '{}')) || {}; } catch (e) { return {}; } })(),
    user: (() => { try { return JSON.parse(store.get('fonts', '[]')) || []; } catch (e) { return []; } })(), // {family, style, b64}
    cache: new Map(),   // 'familia|estilo' -> { family, style, data }
    tried: new Set(),   // fontes que já tentamos baixar
    sent: new Set(),    // fontes que o motor atual já recebeu
    parse(spec) {
      const parts = String(spec).split(':');
      let st = 'regular';
      for (const p of parts.slice(1)) { const m = /^\s*style\s*=\s*(.*)$/i.exec(p); if (m) st = m[1]; }
      const b = /bold|negrito|700|800|900/i.test(st), i = /italic|oblique|italico|itálico/i.test(st);
      return { fam: parts[0].trim(), st: b && i ? 'bold italic' : b ? 'bold' : i ? 'italic' : 'regular' };
    },
    key(spec) { const f = this.parse(spec); return f.fam.toLowerCase() + '|' + f.st; },
    scan(code) {
      const out = new Set(), re = /\bfont\s*=\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(code))) out.add(m[1]);
      return out;
    },
    saveLibs() { store.set('libs', JSON.stringify(this.libs)); },
    saveUser() { try { localStorage.setItem('forja3d:fonts', JSON.stringify(this.user)); return true; } catch (e) { return false; } },
    b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; },
    bufToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); },
    loadUser() {
      for (const f of this.user) {
        try { this.cache.set(f.family.toLowerCase() + '|' + f.style, { family: f.family, style: f.style, data: this.b64ToBuf(f.b64) }); } catch (e) { /* fonte guardada corrompida */ }
      }
    },
    async download(spec) {
      const { fam, st } = this.parse(spec);
      const id = fam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!id) return null;
      const w = /bold/.test(st) ? 700 : 400, style = /italic/.test(st) ? 'italic' : 'normal';
      const urls = [
        `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${w}-${style}.woff`,
        `https://cdn.jsdelivr.net/npm/@fontsource/${id}/files/${id}-latin-${w}-${style}.woff`,
      ];
      for (const u of urls) {
        try {
          const r = await fetch(u);
          if (!r.ok) continue;
          const data = await r.arrayBuffer();
          if (window.opentype) window.opentype.parse(data); // confere se é uma fonte válida
          return { family: fam, style: st, data };
        } catch (e) { /* tenta o próximo endereço */ }
      }
      return null;
    },
    missing(specs) { return [...specs].filter((sp) => !this.cache.has(this.key(sp)) && !this.tried.has(this.key(sp))); },
    // baixa as fontes pedidas que ainda não temos; devolve true se chegou alguma
    async ensure(specs) {
      const todo = this.missing(specs);
      if (!todo.length) return false;
      let got = false;
      await Promise.all(todo.map(async (sp) => {
        const k = this.key(sp);
        this.tried.add(k);
        const f = await this.download(sp);
        if (f) { this.cache.set(k, f); got = true; }
      }));
      return got;
    },
    // o que vai junto com cada pedido ao motor: bibliotecas e as fontes que ele ainda não recebeu
    payload() {
      const fonts = [];
      for (const [k, f] of this.cache) if (!this.sent.has(k)) { fonts.push(f); this.sent.add(k); }
      return { libs: this.libs, fonts };
    },
  };
  res.loadUser();

  // ───────── execução em segundo plano ─────────
  function makeWorker() {
    return new Worker('js/worker.js');
  }

  const runner = {
    mode: 'starting', w: null, busy: false, queued: null, curId: 0, seq: 0, started: 0, exports: new Map(), local: null,
    init() { try { this.spawn(); } catch (e) { this.goLocal(); } },
    spawn() {
      res.sent.clear();
      this.mode = 'starting';
      let w;
      try { w = makeWorker(); } catch (e) { this.goLocal(); return; }
      this.w = w;
      const timer = setTimeout(() => { if (this.w === w && this.mode === 'starting') { w.terminate(); this.goLocal(); } }, 30000);
      w.onmessage = (e) => {
        if (this.w !== w) return;
        const m = e.data;
        if (m && m.type === 'hello') {
          clearTimeout(timer);
          if (!m.ok) { w.terminate(); this.goLocal(); return; }
          this.mode = 'worker';
          this.pump();
          return;
        }
        this.onReply(m);
      };
      w.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (this.w !== w) return;
        clearTimeout(timer);
        w.terminate();
        if (this.mode === 'starting') this.goLocal();
        else { this.busy = false; ui.renderStopped('O motor parou inesperadamente. Tente renderizar de novo.'); this.spawn(); }
      };
      w.postMessage({ type: 'hello' });
    },
    // plano B: sem worker, o motor roda na própria página (a interface pode travar durante o cálculo)
    goLocal() {
      res.sent.clear();
      this.w = null;
      this.mode = 'starting';
      import(new URL('vendor/manifold/manifold.js', document.baseURI).href)
        .then((mod) => mod.default())
        .then((wasm) => {
          wasm.setup();
          E.setManifold(wasm);
          this.local = window.forjaHandler(E, 60000);
          this.mode = 'local';
          this.pump();
        })
        .catch((err) => {
          this.mode = 'failed';
          ui.engineFailed('Não foi possível carregar o motor 3D. Abra o Forja 3D por um endereço http(s), não direto do disco. (' + ((err && err.message) || err) + ')');
        });
    },
    send(m) {
      if (m.type === 'run' || m.type === 'export') { Object.assign(m, res.payload()); m.center = centerOn; }
      if (this.mode === 'worker') { this.w.postMessage(m); return; }
      setTimeout(() => {
        let o;
        try { o = this.local(m); } catch (err) {
          o = { reply: m.type === 'export' ? { type: 'export', id: m.id, error: String(err.message || err) } : { type: 'result', id: m.id, meshes: [], echoes: [], warnings: [], error: { msg: String(err.message || err), line: null }, time: 0 } };
        }
        this.onReply(o.reply);
      }, 30);
    },
    run(code) {
      this.queued = code;
      if (this.busy && this.mode === 'worker' && performance.now() - this.started > 600) this.restart();
      this.pump();
    },
    pump() {
      if (this.busy || this.queued === null || this.mode === 'starting' || this.mode === 'failed') return;
      const code = this.queued;
      this.queued = null;
      this.busy = true;
      this.started = performance.now();
      this.curId = ++this.seq;
      ui.renderStarted(this.mode === 'local');
      const id = this.curId;
      const go = () => { if (this.curId === id && this.busy) this.send({ type: 'run', id, code }); };
      const want = res.missing(res.scan(code));
      if (want.length) res.ensure(want).then(go); else go();
    },
    onReply(m) {
      if (!m) return;
      if (m.type === 'result') {
        if (m.id !== this.curId) return;
        this.busy = false;
        ui.renderDone(m);
        const need = res.missing(m.fontsWanted || []);
        if (need.length) res.ensure(need).then((got) => { if (got) requestRender(0); });
        this.pump();
      } else if (m.type === 'export') {
        const p = this.exports.get(m.id);
        if (p) { this.exports.delete(m.id); p.resolve(m); }
      }
    },
    restart() {
      res.sent.clear();
      if (this.w) this.w.terminate();
      for (const p of this.exports.values()) p.reject(new Error('Exportação interrompida.'));
      this.exports.clear();
      this.busy = false;
      this.spawn();
    },
    // um erro dentro do WebAssembly deixa a memória dele inutilizável: começa um motor novo
    recover() {
      if (this.mode === 'worker') this.restart();
      else if (this.mode === 'local') this.goLocal();
    },
    stop() {
      this.queued = null;
      if (this.mode !== 'worker') return;
      this.restart();
      ui.renderStopped('Renderização interrompida.');
    },
    exportModel(format, code, name) {
      return new Promise((resolve, reject) => {
        const id = ++this.seq;
        this.exports.set(id, { resolve, reject });
        const go = () => {
          if (this.mode === 'starting') return setTimeout(go, 120);
          if (this.mode === 'failed') { this.exports.delete(id); reject(new Error('O motor 3D não carregou.')); return; }
          const want = res.missing(res.scan(code));
          const fire = () => this.send({ type: 'export', id, format, code, name });
          if (want.length) res.ensure(want).then(fire); else fire();
        };
        go();
      });
    },
  };

  // ───────── interface de renderização ─────────
  const statusEl = $('#status');
  function setStatus(s, text) { statusEl.dataset.s = s; statusEl.querySelector('span').textContent = text; }
  const fmtMs = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  let centerOn = store.get('center', '0') === '1';
  let fitNext = true, busyT = 0, busyTick = 0, lastResult = null, lastGood = null;
  function stopBusy() { clearTimeout(busyT); clearInterval(busyTick); $('#busy').hidden = true; }

  const ui = {
    renderStarted(blocking) {
      setStatus('busy', 'Renderizando…');
      stopBusy();
      const t0 = performance.now();
      const label = $('#busy span');
      label.textContent = 'Renderizando…';
      busyT = setTimeout(() => { $('#busy').hidden = false; $('#btnStop').hidden = runner.mode !== 'worker'; }, blocking ? 0 : 350);
      busyTick = setInterval(() => {
        const sec = Math.round((performance.now() - t0) / 1000);
        if (sec >= 2) { label.textContent = `Renderizando… ${sec} s`; setStatus('busy', `Renderizando… ${sec} s`); }
      }, 1000);
    },
    engineFailed(msg) {
      stopBusy();
      setStatus('err', 'Motor 3D indisponível');
      const eb = $('#errbar');
      eb.hidden = false;
      eb.querySelector('b').textContent = 'Erro';
      eb.querySelector('span').textContent = msg;
      eb.dataset.line = '';
    },
    renderStopped(msg) {
      stopBusy();
      setStatus('stale', 'Interrompido');
      if (msg) toast(msg);
    },
    renderDone(m) {
      stopBusy();
      lastResult = m;
      const tris = m.meshes.reduce((s, x) => s + (x.ghost ? 0 : x.pos.length / 9), 0);
      if (m.error) {
        if (/memory access out of bounds|unreachable|Aborted|out of memory/i.test(m.error.msg)) runner.recover();
        setStatus('err', m.error.line ? `Erro na linha ${m.error.line}` : 'Erro');
        const eb = $('#errbar');
        eb.hidden = false;
        eb.querySelector('b').textContent = m.error.line ? `Linha ${m.error.line}` : 'Erro';
        eb.querySelector('span').textContent = m.error.msg;
        eb.dataset.line = m.error.line || '';
      } else {
        $('#errbar').hidden = true;
        setStatus(stale ? 'stale' : 'ok', `${m.count} ${m.count === 1 ? 'objeto' : 'objetos'} · ${fmtMs(m.time)}`);
        lastGood = m;
        viewer.setMeshes(m.meshes);
        showReadout(m);
        $('#empty').hidden = m.meshes.length > 0;
        if (fitNext) { viewer.fit('iso', false); fitNext = false; }
      }
      markEditor(m);
      buildConsole(m, tris);
    },
  };
  let stale = false;

  function showReadout(m) {
    const ro = $('#readout');
    if (!m.bounds) { ro.hidden = true; return; }
    const [a, b] = m.bounds;
    const f = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
    const axes = m.has3d ? ['X', 'Y', 'Z'] : ['X', 'Y'];
    ro.querySelector('.dims').innerHTML = axes.map((ax, i) => `<div class="dim" data-ax="${ax}"><em>${ax}</em><b>${f(b[i] - a[i])}</b></div>`).join('') + '<span class="unit">mm</span>';
    const mass = ro.querySelector('.mass');
    if (m.has3d && m.volume > 0) {
      const cm3 = m.volume / 1000, g = cm3 * 1.24;
      mass.innerHTML = `<span class="stat"><b>${cm3 < 10 ? cm3.toFixed(2) : cm3.toFixed(1)}</b> cm³</span>` +
        `<span class="stat"><b>≈ ${g < 10 ? g.toFixed(1) : Math.round(g)}</b> g</span><span class="tag">maciço</span>`;
      mass.title = 'Peso estimado com densidade de 1,24 g/cm³ (PLA), considerando a peça toda maciça (100% de preenchimento).';
      mass.hidden = false;
    } else if (m.has2d && !m.has3d) { mass.innerHTML = '<span class="note">Formas 2D: exporte em SVG ou use linear_extrude()</span>'; mass.title = ''; mass.hidden = false; }
    else mass.hidden = true;
    ro.hidden = false;
  }

  function markEditor(m) {
    cm.operation(() => {
      cm.clearGutter('forja-marks');
      for (let l = 0; l <= cm.lastLine(); l++) cm.removeLineClass(l, 'background', 'cm-err-line');
      for (const w of m.warnings || []) {
        if (!w.line || w.line - 1 > cm.lastLine()) continue;
        const el = document.createElement('span'); el.className = 'gm warn'; el.title = w.msg;
        cm.setGutterMarker(w.line - 1, 'forja-marks', el);
      }
      if (m.error && m.error.line && m.error.line - 1 <= cm.lastLine()) {
        const el = document.createElement('span'); el.className = 'gm err'; el.title = m.error.msg;
        cm.setGutterMarker(m.error.line - 1, 'forja-marks', el);
        cm.addLineClass(m.error.line - 1, 'background', 'cm-err-line');
      }
    });
  }

  function logRow(kind, line, msg) {
    const row = document.createElement('div');
    row.className = 'row ' + kind;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ln' + (line ? '' : ' none');
    b.textContent = line ? `linha ${line}` : '—';
    if (line) b.addEventListener('click', () => jumpToLine(line));
    else b.tabIndex = -1;
    const s = document.createElement('span'); s.className = 'msg'; s.textContent = msg;
    row.append(b, s);
    return row;
  }
  function buildConsole(m, tris) {
    const log = $('#log');
    log.innerHTML = '';
    if (m.error) log.appendChild(logRow('err', m.error.line, m.error.msg));
    else log.appendChild(logRow('info', null, `Renderizado em ${fmtMs(m.time)} · ${m.count} ${m.count === 1 ? 'objeto' : 'objetos'} · ${Math.round(tris).toLocaleString('pt-BR')} triângulos`));
    for (const w of m.warnings || []) log.appendChild(logRow('warn', w.line, 'Aviso: ' + w.msg));
    for (const e of m.echoes || []) log.appendChild(logRow('echo', e.line, e.msg));
    const bad = (m.error ? 1 : 0) + (m.warnings || []).length;
    const badge = $('#bConsole');
    badge.textContent = bad || (m.echoes || []).length;
    badge.className = 'badge' + (m.error ? ' err' : (m.warnings || []).length ? ' warn' : '');
  }

  // ───────── agendamento ─────────
  let renderT = 0;
  function requestRender(delay) {
    clearTimeout(renderT);
    renderT = setTimeout(() => { stale = false; runner.run(cm.getValue()); }, delay || 0);
  }
  function renderNow() { requestRender(0); }

  // ───────── parâmetros ─────────
  let params = [], paramSig = '', applyingParam = false, baseline = null;
  const prettify = (n) => { const s = n.replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const decs = (x) => { const s = String(x); if (s.includes('e-')) return 6; return s.includes('.') ? s.split('.')[1].length : 0; };
  function stepFor(p) {
    if (p.ann && p.ann.step) return p.ann.step;
    let d = decs(p.value);
    if (p.ann && p.ann.kind === 'slider') d = Math.max(d, decs(p.ann.min), decs(p.ann.max));
    return d ? Math.pow(10, -Math.min(d, 3)) : 1;
  }
  const roundTo = (v, step) => Number(v.toFixed(Math.min(6, decs(step))));

  function refreshParams(force) {
    const code = cm.getValue();
    let ast;
    try { ast = E.parse(code); } catch (e) { return; }
    const ps = E.extractParams(code, ast);
    userSymbols = { mods: [], funcs: [], vars: [] };
    for (const st of ast.body) {
      if (st.type === 'moddef') userSymbols.mods.push(st.name);
      else if (st.type === 'fundef') userSymbols.funcs.push(st.name);
      else if (st.type === 'assign' && st.name[0] !== '$') userSymbols.vars.push(st.name);
    }
    const sig = JSON.stringify(ps.map((p) => [p.name, p.type, p.ann, p.group, p.desc, Array.isArray(p.value) ? p.value.length : 0]));
    params = ps;
    if (force || sig !== paramSig) { paramSig = sig; buildParams(); } else syncParamControls();
    $('#bParams').textContent = ps.length;
    updateResetBtn();
  }
  function captureBaseline() {
    baseline = new Map(params.map((p) => [p.name, JSON.stringify(p.value)]));
    updateResetBtn();
  }
  function updateResetBtn() {
    const changed = baseline && params.some((p) => baseline.has(p.name) && baseline.get(p.name) !== JSON.stringify(p.value));
    $('#btnResetParams').hidden = !changed || currentTab !== 'params';
  }

  function setParam(name, value) {
    const p = params.find((q) => q.name === name);
    if (!p) return;
    const text = E.literalText(value);
    const from = cm.posFromIndex(p.s), to = cm.posFromIndex(p.e);
    if (cm.getRange(from, to) === text) return;
    applyingParam = true;
    cm.replaceRange(text, from, to, '+param');
    applyingParam = false;
    const d = text.length - (p.e - p.s);
    for (const q of params) if (q !== p && q.s > p.s) { q.s += d; q.e += d; }
    p.e = p.s + text.length;
    p.value = value;
    updateResetBtn();
    saveDraftSoon();
    requestRender(40);
  }

  function buildParams() {
    const host = $('#pParams');
    host.innerHTML = '';
    if (!params.length) {
      host.innerHTML = `<div class="pempty"><p>As variáveis do topo do arquivo viram controles aqui. Escreva um comentário com o intervalo para ganhar um controle deslizante:</p><pre>altura = 20;   // [5:100]
furo = 3.5;    // [1:0.5:10]
modelo = "A";  // [A, B, C]
tampa = true;</pre></div>`;
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'params';
    let group = undefined;
    params.forEach((p, idx) => {
      if (p.group !== group) {
        group = p.group;
        if (group) { const g = document.createElement('div'); g.className = 'pgroup'; g.textContent = group; wrap.appendChild(g); }
      }
      const row = document.createElement('div');
      row.className = 'prow';
      row.dataset.name = p.name;
      const id = 'p-' + p.name;
      const lab = document.createElement('label');
      lab.htmlFor = id;
      const nice = prettify(p.name);
      if (p.desc && p.desc.toLowerCase().startsWith(nice.toLowerCase())) lab.textContent = p.desc;
      else {
        lab.textContent = nice;
        if (p.desc) { const sm = document.createElement('small'); sm.textContent = p.desc; lab.appendChild(sm); }
      }
      const ctl = document.createElement('div');
      ctl.className = 'pctl';
      if (p.ann && p.ann.kind === 'select') {
        const sel = document.createElement('select');
        sel.className = 'sel'; sel.id = id;
        p.ann.options.forEach((o, i) => { const op = document.createElement('option'); op.value = String(i); op.textContent = o.label; sel.appendChild(op); });
        sel.addEventListener('change', () => setParam(p.name, p.ann.options[+sel.value].value));
        ctl.appendChild(sel);
      } else if (p.type === 'number') {
        const step = stepFor(p);
        const num = document.createElement('input');
        num.type = 'number'; num.className = 'num'; num.step = String(step); num.id = id; num.inputMode = 'decimal';
        if (p.ann && p.ann.kind === 'slider') {
          const rg = document.createElement('input');
          rg.type = 'range'; rg.min = String(p.ann.min); rg.max = String(p.ann.max); rg.step = String(step);
          rg.setAttribute('aria-label', prettify(p.name));
          rg.id = id + '-r';
          rg.addEventListener('input', () => { const v = roundTo(+rg.value, step); num.value = String(v); setParam(p.name, v); });
          ctl.appendChild(rg);
        }
        num.addEventListener('change', () => { const v = parseFloat(num.value.replace(',', '.')); if (Number.isFinite(v)) { setParam(p.name, v); const rg = ctl.querySelector('input[type=range]'); if (rg) rg.value = String(v); } });
        ctl.appendChild(num);
      } else if (p.type === 'bool') {
        const sw = document.createElement('span'); sw.className = 'switch';
        sw.innerHTML = `<input type="checkbox" id="${id}"><span></span>`;
        sw.querySelector('input').addEventListener('change', (e) => setParam(p.name, e.target.checked));
        ctl.appendChild(sw);
      } else if (p.type === 'string') {
        const t = document.createElement('input');
        t.type = 'text'; t.className = 'txt'; t.id = id; t.spellcheck = false;
        t.addEventListener('input', () => setParam(p.name, t.value));
        ctl.appendChild(t);
      } else if (p.type === 'vector') {
        const v = document.createElement('div'); v.className = 'vec';
        p.value.forEach((_, i) => {
          const n = document.createElement('input');
          n.type = 'number'; n.className = 'num'; n.step = 'any'; n.inputMode = 'decimal';
          n.id = i === 0 ? id : id + '-' + i;
          n.setAttribute('aria-label', `${prettify(p.name)} [${i}]`);
          n.addEventListener('change', () => {
            const cur = params.find((q) => q.name === p.name);
            const val = parseFloat(n.value.replace(',', '.'));
            if (!cur || !Number.isFinite(val)) return;
            const nv = cur.value.slice(); nv[i] = val; setParam(p.name, nv);
          });
          v.appendChild(n);
        });
        ctl.appendChild(v);
      }
      row.append(lab, ctl);
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
    syncParamControls(true);
  }

  function syncParamControls(all) {
    for (const p of params) {
      const row = $(`.prow[data-name="${CSS.escape(p.name)}"]`);
      if (!row) continue;
      const act = document.activeElement;
      if (p.ann && p.ann.kind === 'select') {
        const sel = row.querySelector('select');
        const i = p.ann.options.findIndex((o) => o.value === p.value || String(o.value) === String(p.value));
        if (sel !== act || all) sel.value = String(Math.max(0, i));
      } else if (p.type === 'number') {
        const num = row.querySelector('.num'), rg = row.querySelector('input[type=range]');
        if (num !== act || all) num.value = String(p.value);
        if (rg && (rg !== act || all)) rg.value = String(p.value);
      } else if (p.type === 'bool') {
        row.querySelector('input').checked = !!p.value;
      } else if (p.type === 'string') {
        const t = row.querySelector('.txt');
        if (t !== act || all) t.value = p.value;
      } else if (p.type === 'vector') {
        row.querySelectorAll('.num').forEach((n, i) => { if (n !== act || all) n.value = String(p.value[i]); });
      }
    }
  }

  $('#btnResetParams').addEventListener('click', () => {
    if (!baseline) return;
    for (const p of params.slice()) {
      if (!baseline.has(p.name)) continue;
      const v = JSON.parse(baseline.get(p.name));
      if (JSON.stringify(p.value) !== baseline.get(p.name)) setParam(p.name, v);
    }
    syncParamControls(true);
    toast('Valores originais restaurados');
  });

  // ───────── gaveta ─────────
  let currentTab = 'params';
  function setTab(t) {
    currentTab = t;
    $$('.dtabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $('#pParams').hidden = t !== 'params';
    $('#pConsole').hidden = t !== 'console';
    $('#pHelp').hidden = t !== 'help';
    $('#pLib').hidden = t !== 'lib';
    updateResetBtn();
    if (t === 'help' && !$('#pHelp').childElementCount) buildHelp();
    if (t === 'lib') buildLib();
  }
  $$('.dtabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ───────── aba Biblioteca: fontes e arquivos .scad ─────────
  const POPULAR_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Oswald', 'Raleway', 'Playfair Display', 'Merriweather', 'Bebas Neue', 'Anton', 'Pacifico', 'Lobster', 'Caveat', 'Permanent Marker', 'Righteous', 'Orbitron', 'Press Start 2P', 'Roboto Mono', 'Fira Code', 'Cinzel', 'Satisfy', 'Dancing Script'];
  let editingLib = null;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function libFileName(n) { n = String(n || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_'); if (!n) return ''; return /\.scad$/i.test(n) ? n : n + '.scad'; }
  function changedLibs() { res.saveLibs(); buildLib(); requestRender(0); }

  function buildLib() {
    const names = Object.keys(res.libs).sort();
    const ed = editingLib && res.libs[editingLib] !== undefined;
    $('#pLib').innerHTML = `<div class="lib">
<section>
  <h3>Fontes</h3>
  <p>Escreva o nome da fonte no <code>text()</code>: <code>text("Olá", font = "Pacifico")</code>. Qualquer fonte do Google Fonts funciona, carregada na hora. Para negrito ou itálico: <code>"Roboto:style=Bold"</code>.</p>
  <div class="lrow">
    <input id="fontName" list="fontList" placeholder="Nome da fonte, ex.: Pacifico" autocomplete="off" spellcheck="false">
    <datalist id="fontList">${POPULAR_FONTS.map((f) => `<option value="${f}">`).join('')}</datalist>
    <button type="button" class="btn" id="fontIns">Inserir no código</button>
  </div>
  <div class="lrow"><button type="button" class="btn" id="fontUp">Enviar arquivo de fonte…</button><small>.ttf, .otf ou .woff — fica guardado neste navegador</small>
    <input type="file" id="fontFile" accept=".ttf,.otf,.woff" hidden></div>
  ${res.user.length ? `<ul class="llist">${res.user.map((f, i) => `<li><b>${esc(f.family)}</b><span>${esc(f.style)}</span><button type="button" class="lmini" data-fdel="${i}">Remover</button></li>`).join('')}</ul>` : ''}
</section>
<section>
  <h3>Bibliotecas (.scad)</h3>
  <p>Escreva ou importe módulos e funções e use com <code>include &lt;nome.scad&gt;;</code> ou <code>use &lt;nome.scad&gt;;</code>. Dá para exportar de volta como arquivo .scad.</p>
  <div class="lrow">
    <input id="libName" placeholder="nome.scad" autocomplete="off" spellcheck="false">
    <button type="button" class="btn" id="libNew">Nova</button>
    <button type="button" class="btn" id="libCode">Salvar o código atual</button>
    <button type="button" class="btn" id="libUp">Importar .scad…</button>
    <input type="file" id="libFile" accept=".scad,.txt" multiple hidden>
  </div>
  ${names.length ? `<ul class="llist">${names.map((n) => `<li><b>${esc(n)}</b><span>${res.libs[n].split('\n').length} linhas</span>
    <button type="button" class="lmini" data-linc="${esc(n)}">Inserir include</button>
    <button type="button" class="lmini" data-ledit="${esc(n)}">Editar</button>
    <button type="button" class="lmini" data-lexp="${esc(n)}">Exportar</button>
    <button type="button" class="lmini" data-ldel="${esc(n)}">Remover</button></li>`).join('')}</ul>` : '<p class="lempty">Nenhuma biblioteca ainda.</p>'}
  ${ed ? `<div class="ledit"><div class="lhead"><b>${esc(editingLib)}</b><span class="lsp"></span><button type="button" class="btn" id="lSave">Salvar</button><button type="button" class="btn" id="lClose">Fechar</button></div>
    <textarea id="lText" spellcheck="false" wrap="off">${esc(res.libs[editingLib])}</textarea></div>` : ''}
</section></div>`;
    const P = $('#pLib');
    $('#fontIns', P).addEventListener('click', () => {
      const n = $('#fontName', P).value.trim();
      if (!n) { toast('Escreva o nome de uma fonte', 'err'); return; }
      if (isMobile()) setPane('code');
      insertCode(`linear_extrude(3) text("Olá", size = 10, font = "${n.replace(/"/g, '')}");`);
      afterTool();
    });
    $('#fontUp', P).addEventListener('click', () => $('#fontFile', P).click());
    $('#fontFile', P).addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const data = await f.arrayBuffer();
        const font = window.opentype.parse(data);
        const nm = (o) => (o && (o.en || Object.values(o)[0])) || '';
        const family = nm(font.names.fontFamily) || f.name.replace(/\.[^.]+$/, '');
        const sub = nm(font.names.fontSubfamily);
        const style = res.parse(family + ':style=' + sub).st;
        res.user = res.user.filter((x) => !(x.family.toLowerCase() === family.toLowerCase() && x.style === style));
        res.user.push({ family, style, b64: res.bufToB64(data) });
        res.cache.set(family.toLowerCase() + '|' + style, { family, style, data });
        if (!res.saveUser()) toast('Fonte carregada, mas não coube no armazenamento do navegador: some ao recarregar', 'err');
        else toast(`Fonte “${family}” pronta: font = "${family}"`);
        buildLib(); requestRender(0);
      } catch (er) { toast('Não consegui ler esse arquivo de fonte', 'err'); }
    });
    $$('[data-fdel]', P).forEach((b) => b.addEventListener('click', () => {
      const f = res.user[+b.dataset.fdel];
      res.user.splice(+b.dataset.fdel, 1);
      res.cache.delete(f.family.toLowerCase() + '|' + f.style);
      res.saveUser(); buildLib();
    }));
    const addLib = (name, text) => {
      const n = libFileName(name);
      if (!n) { toast('Dê um nome para a biblioteca', 'err'); return null; }
      if (res.libs[n] !== undefined && text === undefined) { toast('Já existe uma biblioteca com esse nome', 'err'); return null; }
      res.libs[n] = text !== undefined ? text : '// ' + n + '\nmodule exemplo(tamanho = 10) {\n  cube(tamanho);\n}\n';
      return n;
    };
    $('#libNew', P).addEventListener('click', () => { const n = addLib($('#libName', P).value); if (n) { editingLib = n; changedLibs(); } });
    $('#libCode', P).addEventListener('click', () => {
      const n = addLib($('#libName', P).value || 'minha_biblioteca', cm.getValue());
      if (n) { editingLib = n; changedLibs(); toast(`Código salvo como ${n}`); }
    });
    $('#libUp', P).addEventListener('click', () => $('#libFile', P).click());
    $('#libFile', P).addEventListener('change', async (e) => {
      const files = [...e.target.files]; e.target.value = '';
      for (const f of files) addLib(f.name, await f.text());
      changedLibs();
    });
    $$('[data-linc]', P).forEach((b) => b.addEventListener('click', () => {
      if (isMobile()) setPane('code');
      cm.replaceRange(`include <${b.dataset.linc}>;\n`, { line: 0, ch: 0 });
      afterTool();
    }));
    $$('[data-ledit]', P).forEach((b) => b.addEventListener('click', () => { editingLib = b.dataset.ledit; buildLib(); }));
    $$('[data-lexp]', P).forEach((b) => b.addEventListener('click', () => saveFile(b.dataset.lexp, new Blob([res.libs[b.dataset.lexp]], { type: 'text/plain;charset=utf-8' }))));
    $$('[data-ldel]', P).forEach((b) => b.addEventListener('click', () => {
      if (!confirm(`Remover a biblioteca ${b.dataset.ldel}?`)) return;
      delete res.libs[b.dataset.ldel];
      if (editingLib === b.dataset.ldel) editingLib = null;
      changedLibs();
    }));
    if (ed) {
      const ta = $('#lText', P);
      $('#lSave', P).addEventListener('click', () => { res.libs[editingLib] = ta.value; res.saveLibs(); toast('Biblioteca salva'); requestRender(0); });
      $('#lClose', P).addEventListener('click', () => { editingLib = null; buildLib(); });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#lSave', P).click(); }
        if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('  ', a, ta.selectionEnd, 'end'); }
      });
    }
  }

  function buildHelp() {
    const ins = (code, label) => `<button type="button" class="ins" data-ins="${code.replace(/"/g, '&quot;')}">${(label || code).replace(/</g, '&lt;')}</button>`;
    $('#pHelp').innerHTML = `<div class="help">
<section><h3>Como funciona</h3>
<p>Você descreve a peça em código e o 3D atualiza sozinho. Cada instrução termina com <b>;</b> e as transformações vêm antes da forma, da direita para a esquerda.</p>
<p>${ins('translate([20, 0, 0]) rotate([0, 0, 45]) cube(10);')}</p>
<p class="note">Medidas em milímetros. Clique numa peça no 3D para ir até a linha dela. Os botões abaixo inserem o exemplo no editor.</p></section>
<section><h3>Formas</h3><dl>
<dt>${ins('cube([20, 10, 5]);')}</dt><dd>Caixa. <code>center = true</code> centraliza na origem.</dd>
<dt>${ins('sphere(r = 10, $fn = 64);')}</dt><dd>Esfera. <code>$fn</code> define a suavidade.</dd>
<dt>${ins('cylinder(h = 20, r1 = 8, r2 = 4);')}</dt><dd>Cilindro ou cone.</dd>
<dt>${ins('linear_extrude(2) text("Olá", size = 8);')}</dt><dd>Texto em relevo.</dd>
</dl></section>
<section><h3>Combinar</h3><dl>
<dt>${ins('difference() {\n  cube(20);\n  translate([10, 10, -1]) cylinder(h = 22, r = 5);\n}', 'difference() { … }')}</dt><dd>A primeira forma menos as outras: é assim que se faz furo.</dd>
<dt>${ins('union() {\n  cube(10);\n  sphere(7);\n}', 'union() { … }')}</dt><dd>Junta as formas.</dd>
<dt>${ins('intersection() {\n  cube(15, center = true);\n  sphere(10);\n}', 'intersection() { … }')}</dt><dd>Só o que é comum a todas.</dd>
<dt>${ins('hull() {\n  sphere(5);\n  translate([30, 0, 0]) sphere(3);\n}', 'hull() { … }')}</dt><dd>Envoltória, como um elástico em volta.</dd>
</dl></section>
<section><h3>Transformar</h3><dl>
<dt><code>translate([x, y, z])</code></dt><dd>Move.</dd>
<dt><code>rotate([x, y, z])</code></dt><dd>Gira em graus, primeiro em X, depois Y, depois Z.</dd>
<dt><code>scale([x, y, z])</code> · <code>resize([x, y, z])</code></dt><dd>Escala por fator ou para medidas exatas.</dd>
<dt><code>mirror([1, 0, 0])</code> · <code>color("azul")</code></dt><dd>Espelha · pinta (nome, <code>"#hex"</code> ou <code>[r, g, b, a]</code>).</dd>
</dl></section>
<section><h3>Do 2D para o 3D</h3><dl>
<dt>${ins('linear_extrude(height = 30, twist = 90, scale = 0.6) square(20, center = true);', 'linear_extrude(...)')}</dt><dd>Puxa um desenho para cima, com torção e afunilamento opcionais.</dd>
<dt>${ins('rotate_extrude($fn = 80) translate([20, 0]) circle(r = 5);', 'rotate_extrude() …')}</dt><dd>Gira um perfil em volta do eixo Z (faz anéis, vasos, copos).</dd>
<dt><code>offset(r = 2)</code> · <code>projection()</code></dt><dd>Contorno arredondado · sombra 2D de uma peça.</dd>
</dl></section>
<section><h3>Lógica</h3><dl>
<dt>${ins('for (i = [0 : 5]) translate([i * 15, 0, 0]) cube(10);', 'for (i = [0 : 5]) …')}</dt><dd>Repete. <code>[início : passo : fim]</code></dd>
<dt>${ins('module pino(h = 10) {\n  cylinder(h = h, r = 2, $fn = 24);\n}\npino(15);', 'module pino(h) { … }')}</dt><dd>Cria uma peça reutilizável com parâmetros.</dd>
<dt><code>function dobro(x) = 2 * x;</code></dt><dd>Funções, <code>if</code>, <code>let</code> e listas <code>[for (i = …) …]</code>.</dd>
<dt><code>echo("valor:", x);</code></dt><dd>Mostra valores no Console.</dd>
</dl></section>
<section><h3>Modificadores</h3><dl>
<dt><code>#forma</code></dt><dd>Destaca em rosa (ótimo para ver o que um difference remove).</dd>
<dt><code>%forma</code> · <code>*forma</code> · <code>!forma</code></dt><dd>Mostra como fantasma · desliga · mostra só ela.</dd>
</dl></section>
<section><h3>Parâmetros</h3>
<p>Variáveis no topo do arquivo, antes do primeiro <code>module</code>, aparecem na aba Parâmetros. O comentário na mesma linha define o controle:</p>
<dl><dt><code>altura = 20; // [5:100]</code></dt><dd>Controle deslizante de 5 a 100.</dd>
<dt><code>folga = 0.2; // [0:0.05:1]</code></dt><dd>De 0 a 1, de 0,05 em 0,05.</dd>
<dt><code>tipo = "A"; // [A, B, C]</code></dt><dd>Lista de opções.</dd>
<dt><code>/* [Medidas] */</code></dt><dd>Começa um grupo. <code>/* [Hidden] */</code> esconde o que vem depois.</dd></dl></section>
<section><h3>Atalhos de teclado</h3><div class="keys">
<span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span><span>Renderizar</span>
<span><kbd>Ctrl</kbd> + <kbd>Espaço</kbd></span><span>Sugestões</span>
<span><kbd>Ctrl</kbd> + <kbd>/</kbd></span><span>Comentar linhas</span>
<span><kbd>Ctrl</kbd> + <kbd>Z</kbd></span><span>Desfazer (inclusive exemplos carregados)</span>
<span>Duplo clique no 3D</span><span>Enquadrar a peça</span>
</div></section>
<section><h3>Em português</h3>
<p>Você também pode escrever <code>cubo</code>, <code>esfera</code>, <code>cilindro</code>, <code>mover</code>, <code>girar</code>, <code>escalar</code>, <code>espelhar</code>, <code>cor</code>, <code>diferenca</code>, <code>uniao</code>, <code>intersecao</code>, <code>envoltoria</code>, <code>extrudar</code> e <code>revolver</code>, e cores como <code>"vermelho"</code> e <code>"azul"</code>. Esses atalhos não existem no OpenSCAD original.</p></section>
<section><h3>Diferenças do OpenSCAD</h3>
<p class="note">Roda no navegador, sem instalar nada. Não carrega bibliotecas com <code>include</code>/<code>use</code> nem arquivos com <code>import()</code>. O <code>text()</code> usa uma fonte de traço simples e remove acentos.</p></section>
</div>`;
    $$('#pHelp .ins').forEach((b) => b.addEventListener('click', () => { if (isMobile()) setPane('code'); insertCode(b.dataset.ins); afterTool(); }));
  }

  // ───────── arquivos ─────────
  const enc = (s) => new TextEncoder().encode(s);
  function safeName() {
    const n = (projName.value || 'modelo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return n || 'modelo';
  }
  function saveFile(filename, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Arquivo baixado: ' + filename);
  }

  async function exportAs(kind) {
    closeMenus();
    const name = safeName();
    const code = cm.getValue();
    if (kind === 'png') { const blob = await viewer.snapshot(); if (blob) saveFile(name + '.png', blob); return; }
    if (kind === 'scad') { saveFile(name + '.scad', new Blob([code], { type: 'text/plain' })); return; }
    toast('Preparando o arquivo…');
    let res;
    try { res = await runner.exportModel(kind, code, name); } catch (e) { toast(e.message, 'err'); return; }
    if (res.error) { toast(res.error, 'err'); return; }
    if (kind === 'stl') saveFile(name + '.stl', new Blob([res.data], { type: 'model/stl' }));
    else if (kind === 'obj') saveFile(name + '.obj', new Blob([res.data], { type: 'text/plain' }));
    else if (kind === 'svg') saveFile(name + '.svg', new Blob([res.data], { type: 'image/svg+xml' }));
  }

  function replaceAll(code) {
    const last = cm.lastLine();
    cm.replaceRange(code, { line: 0, ch: 0 }, { line: last, ch: cm.getLine(last).length }, 'load');
    cm.setCursor({ line: 0, ch: 0 });
    cm.scrollTo(0, 0);
  }
  function loadCode(code, name, msg) {
    replaceAll(code);
    if (name) { projName.value = name; store.set('name', name); }
    fitNext = true;
    refreshParams(true);
    captureBaseline();
    saveDraftNow();
    renderNow();
    if (isMobile()) setPane('view');
    if (msg) toast(msg);
  }
  function readFile(f) {
    closeMenus();
    const r = new FileReader();
    r.onload = () => loadCode(String(r.result), f.name.replace(/\.(scad|txt)$/i, ''), `${f.name} aberto. Ctrl+Z desfaz.`);
    r.onerror = () => toast('Não foi possível ler o arquivo.', 'err');
    r.readAsText(f);
  }
  $('#fileInput').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) readFile(f); e.target.value = ''; });
  cm.on('drop', (c, e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); readFile(f); } });

  // ───────── menus ─────────
  const MENUS = [['#btnExamples', '#menuExamples'], ['#btnFile', '#menuFile'], ['#btnExport', '#menuExport']];
  // mantém o menu inteiro dentro da tela (celular, janelas estreitas)
  function placeMenu(menu) {
    const pad = 8;
    menu.style.transform = '';
    menu.style.maxHeight = '';
    const r = menu.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (r.left + dx < pad) dx = pad - r.left;
    if (dx) menu.style.transform = `translateX(${Math.round(dx)}px)`;
    menu.style.maxHeight = Math.max(160, window.innerHeight - r.top - 12) + 'px';
  }
  function closeMenus() { MENUS.forEach(([b, m]) => { $(m).hidden = true; $(b).setAttribute('aria-expanded', 'false'); }); }
  MENUS.forEach(([b, m]) => {
    $(b).addEventListener('click', (e) => {
      e.stopPropagation();
      const open = $(m).hidden;
      closeMenus();
      if (open) {
        $(m).hidden = false;
        $(b).setAttribute('aria-expanded', 'true');
        placeMenu($(m));
        const first = $(m).querySelector('button:not([disabled])');
        if (first) first.focus();
      }
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); renderNow(); }
  });

  const exMenu = $('#menuExamples');
  EX.forEach((ex) => {
    const b = document.createElement('button');
    b.innerHTML = icon('cube') + '<b></b><small></small>';
    b.querySelector('b').textContent = ex.title;
    b.querySelector('small').textContent = ex.desc;
    b.addEventListener('click', () => { closeMenus(); loadCode(ex.code, ex.id, `“${ex.title}” carregado. Ctrl+Z desfaz.`); });
    exMenu.appendChild(b);
  });
  $$('#menuFile [data-act]').forEach((b) => b.addEventListener('click', () => {
    closeMenus();
    const act = b.dataset.act;
    if (act === 'new') loadCode('// Novo projeto. Comece pela bandeja de formas acima.\n\n$fn = 48;\n\n', 'novo-projeto', 'Projeto novo. Ctrl+Z desfaz.');
    else if (act === 'open') $('#fileInput').click();
    else if (act === 'copy') {
      const text = cm.getValue();
      const fallback = () => { cm.focus(); cm.execCommand('selectAll'); toast('O código está selecionado: copie com Ctrl+C.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Código copiado.')).catch(fallback);
      else fallback();
    }
  }));
  $$('#menuExport [data-exp]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.exp)));

  // ───────── barra superior e visualização ─────────
  $('#btnRender').addEventListener('click', renderNow);
  $('#btnStop').addEventListener('click', () => runner.stop());
  statusEl.addEventListener('click', () => { if (statusEl.dataset.s === 'err' && lastResult && lastResult.error) jumpToLine(lastResult.error.line); });
  $('#errbar').addEventListener('click', () => { const l = +$('#errbar').dataset.line; if (l) jumpToLine(l); });
  const autoEl = $('#autoRender');
  autoEl.checked = store.get('auto', '1') === '1';
  autoEl.addEventListener('change', () => { store.set('auto', autoEl.checked ? '1' : '0'); if (autoEl.checked) renderNow(); });
  projName.addEventListener('input', () => store.set('name', projName.value));

  const tCenter = $('.vt[data-toggle="center"]');
  tCenter.setAttribute('aria-pressed', String(centerOn));
  function setCenter(on) {
    centerOn = on;
    store.set('center', on ? '1' : '0');
    tCenter.setAttribute('aria-pressed', String(on));
    fitNext = true;
    renderNow();
    toast(on ? 'Peça centralizada no meio da mesa (também no STL exportado)' : 'Posição original da peça');
  }
  tCenter.addEventListener('click', () => setCenter(!centerOn));
  $$('.vt[data-view]').forEach((b) => b.addEventListener('click', () => viewer.fit(b.dataset.view === 'fit' ? null : b.dataset.view)));
  const tEdges = $('.vt[data-toggle="edges"]'), tGrid = $('.vt[data-toggle="grid"]');
  tEdges.setAttribute('aria-pressed', String(viewer.edges));
  tGrid.setAttribute('aria-pressed', String(viewer.grid));
  tEdges.addEventListener('click', () => { const on = tEdges.getAttribute('aria-pressed') !== 'true'; tEdges.setAttribute('aria-pressed', String(on)); viewer.setEdges(on); });
  // atalhos do teclado para a visualização (fora do editor e dos campos de texto)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.closest('.CodeMirror') || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };
    if (arrows[k] && !e.target.closest('.menu, .dpanel, .tray, .dtabs')) {
      const [ax, ay] = arrows[k];
      if (e.shiftKey) viewer.panBy(ax * 40, ay * 40); else viewer.orbitBy(ax * 12, ay * 12);
      e.preventDefault(); return;
    }
    if (k === '+' || k === '=' || k === '-' || k === '_') { viewer.zoomBy(k === '+' || k === '=' ? 0.85 : 1.18); e.preventDefault(); return; }
    const views = { '1': 'iso', '2': 'top', '3': 'front', '4': 'right' };
    if (views[k]) viewer.fit(views[k]);
    else if (k === 'f') viewer.fit(null);
    else if (k === 'c') setCenter(!centerOn);
    else if (k === 'g') tGrid.click();
    else if (k === 'e') tEdges.click();
    else return;
    e.preventDefault();
  });
  ['pointerdown', 'wheel'].forEach((ev) => $('#view').addEventListener(ev, () => { viewer.hideHint(); store.set('hint', '1'); }, { passive: true }));
  if (store.get('hint', '0') === '1') viewer.hideHint();
  tGrid.addEventListener('click', () => { const on = tGrid.getAttribute('aria-pressed') !== 'true'; tGrid.setAttribute('aria-pressed', String(on)); viewer.setGrid(on); });

  // ───────── alterações no código ─────────
  let draftT = 0, paramT = 0;
  function saveDraftNow(announce) { store.set('code', cm.getValue()); store.set('name', projName.value); if (announce) toast('Rascunho salvo neste navegador.'); }
  function saveDraftSoon() { clearTimeout(draftT); draftT = setTimeout(saveDraftNow, 600); }
  cm.on('changes', (c, changes) => {
    saveDraftSoon();
    if (applyingParam || changes.every((ch) => ch.origin === '+param')) return;
    clearTimeout(paramT);
    paramT = setTimeout(() => refreshParams(false), 260);
    if (changes.some((ch) => ch.origin === 'load')) return;
    if (autoEl.checked) requestRender(550);
    else { stale = true; if (statusEl.dataset.s !== 'busy') setStatus('stale', 'Alterado · Ctrl+Enter'); }
  });

  // ───────── divisórias ─────────
  const bench = $('#bench');
  const savedLeft = store.get('left', ''), savedDrawer = store.get('drawer', '');
  if (savedLeft) bench.style.setProperty('--left', savedLeft);
  if (savedDrawer) $('.pane-stage').style.setProperty('--drawer', savedDrawer);
  function setupSplit(el, axis) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      const move = (ev) => {
        if (axis === 'v') {
          const r = bench.getBoundingClientRect();
          const x = clamp(ev.clientX - r.left, 300, r.width - 360);
          bench.style.setProperty('--left', x + 'px');
        } else {
          const r = $('.pane-stage').getBoundingClientRect();
          const y = clamp(r.bottom - ev.clientY, 110, r.height - 180);
          $('.pane-stage').style.setProperty('--drawer', y + 'px');
        }
      };
      const up = () => {
        el.classList.remove('drag');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        store.set('left', bench.style.getPropertyValue('--left'));
        store.set('drawer', $('.pane-stage').style.getPropertyValue('--drawer'));
        cm.refresh();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }
  setupSplit($('#splitV'), 'v');
  setupSplit($('#splitH'), 'h');

  // ───────── celular ─────────
  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
  function setPane(p) {
    document.body.dataset.pane = p;
    $$('.mtabs [data-pane]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === p)));
    if (p === 'code') setTimeout(() => cm.refresh(), 0);
    if (p === 'view') { setTimeout(() => { viewer.resize(); viewer.redraw(); }, 0); }
  }
  $$('.mtabs [data-pane]').forEach((b) => b.addEventListener('click', () => setPane(b.dataset.pane)));
  setPane(isMobile() ? 'view' : 'code');

  // ───────── tema ─────────
  const onTheme = () => setTimeout(() => viewer.applyTheme(), 30);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ───────── início ─────────
  buildTray();
  setTab('params');
  refreshParams(true);
  captureBaseline();
  cm.setCursor({ line: 0, ch: 0 });
  runner.init();
  renderNow();
  window.addEventListener('resize', () => { cm.refresh(); closeMenus(); });
})();
