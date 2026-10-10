const E = require('../js/engine.js');

(async () => {
const wasm = await (await import('manifold-3d')).default();
wasm.setup();
E.setManifold(wasm);

let fails = 0;
function check(name, src, fn) {
  const r = E.run(src);
  try {
    if (r.error) throw new Error('ERRO: ' + r.error.msg + ' (linha ' + r.error.line + ')');
    fn(r);
    console.log('ok  ', name, `(${r.time}ms)`);
  } catch (e) { fails++; console.log('FAIL', name, '-', e.message, r.warnings.map(w=>w.msg+'@'+w.line).join('; ')); }
}
const near = (a, b, tol, what) => { if (Math.abs(a - b) > tol) throw new Error(`${what||''} esperado ${b}, obtido ${a}`); };
const echo = (r) => r.echoes.map(e => e.msg);
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

check('cube volume', 'cube([10,20,30]);', r => near(E.volume(r.objects), 6000, 1e-6));
check('cube center bbox', 'cube(10, center=true);', r => eq(E.bounds(r.objects), [[-5,-5,-5],[5,5,5]]));
check('sphere volume ~', 'sphere(r=10, $fn=96);', r => near(E.volume(r.objects), 4/3*Math.PI*1000, 4/3*Math.PI*1000*0.01));
check('cylinder vol', 'cylinder(h=10, r=5, $fn=200);', r => near(E.volume(r.objects), Math.PI*25*10, 3));
check('cone vol', 'cylinder(h=9, r1=3, r2=0, $fn=200);', r => near(E.volume(r.objects), Math.PI*9*9/3, 0.5));
check('difference', 'difference(){ cube(10); translate([5,5,-1]) cylinder(h=12, r=2, $fn=64); }', r => near(E.volume(r.objects), 1000 - Math.PI*4*10, 1));
check('union overlap', 'union(){ cube(10); translate([5,0,0]) cube(10); }', r => near(E.volume(r.objects), 1500, 1e-6));
check('intersection', 'intersection(){ cube(10); translate([5,5,5]) cube(10); }', r => near(E.volume(r.objects), 125, 1e-6));
check('translate/rotate bbox', 'rotate([0,0,90]) translate([10,0,0]) cube([4,2,1]);', r => { const b=E.bounds(r.objects); near(b[0][0], -2, 1e-9); near(b[1][1], 14, 1e-9); });
check('rotate xyz order', 'rotate([90,0,90]) cube([1,2,3]);', r => { const b=E.bounds(r.objects); /* x-rot 90: y->z ; then z rot 90 */ eq(b.map(p=>p.map(v=>Math.round(v*1e6)/1e6)), [[0,0,0],[3,1,2]]); });
check('mirror keeps volume', 'mirror([1,0,0]) cube([3,4,5]);', r => { near(E.volume(r.objects), 60, 1e-9); near(E.bounds(r.objects)[0][0], -3, 1e-9); });
check('scale', 'scale([2,1,0.5]) cube(10);', r => near(E.volume(r.objects), 1000, 1e-9));
check('for loop', 'for (i=[0:4]) translate([i*20,0,0]) cube(10);', r => { eq(r.objects.length, 5); near(E.volume(r.objects), 5000, 1e-6); });
check('nested for', 'for (i=[0:1], j=[0:2]) translate([i*20,j*20,0]) cube(5);', r => eq(r.objects.length, 6));
check('module + children', 'module dup(d){ children(); translate([d,0,0]) children(); } dup(20) cube(5);', r => eq(r.objects.length, 2));
check('children index', 'module second(){ children(1); } second(){ cube(1); sphere(1); cylinder(1); }', r => { eq(r.objects.length,1); });
check('$children', 'module c(){ echo($children); } c(){cube(1);cube(2);a=3;}', r => eq(echo(r), ['ECHO: 2']));
check('functions & recursion', 'function fact(n) = n<=1 ? 1 : n*fact(n-1); echo(fact(10));', r => eq(echo(r), ['ECHO: 3628800']));
check('list comprehension', 'v=[for (i=[1:5]) if (i%2==1) i*i]; echo(v);', r => eq(echo(r), ['ECHO: [1, 9, 25]']));
check('each & let', 'v=[each [1,2], for(i=[0:1]) let(k=i*10) k]; echo(v);', r => eq(echo(r), ['ECHO: [1, 2, 0, 10]']));
check('c-style for', 'echo([for (i=0; i<4; i=i+1) i]);', r => eq(echo(r), ['ECHO: [0, 1, 2, 3]']));
check('function literal', 'f = function(x) x*2; echo(f(21));', r => eq(echo(r), ['ECHO: 42']));
check('str/len/concat', 'echo(str("a",1,[2,3]), len("abc"), concat([1],[2,3]));', r => eq(echo(r), ['ECHO: "a1[2, 3]", 3, [1, 2, 3]']));
check('numbers fmt', 'echo(1/3, 1e7, 0.00001, -0, 2^10, -2^2);', r => eq(echo(r), ['ECHO: 0.333333, 10000000, 1e-05, 0, 1024, -4']));
check('trig exact', 'echo(sin(180), cos(90), sin(30), atan2(1,1));', r => eq(echo(r), ['ECHO: 0, 0, 0.5, 45']));
check('vector math', 'echo([1,2,3]+[1,1,1], [1,2,3]*2, [1,2,3]*[1,2,3], [[1,0],[0,2]]*[3,4], norm([3,4]), cross([1,0,0],[0,1,0]));', r => eq(echo(r), ['ECHO: [2, 3, 4], [2, 4, 6], 14, [3, 8], 5, [0, 0, 1]']));
check('special var scoping', '$fn=6; module m(){ echo($fn); } m(); m($fn=8);', r => eq(echo(r), ['ECHO: 6','ECHO: 8']));
check('lexical scoping', 'a=1; module m(){ echo(a); } module n(){ a=2; m(); } n();', r => eq(echo(r), ['ECHO: 1']));
check('assign hoist', 'echo(x); x=5;', r => eq(echo(r), ['ECHO: 5']));
check('lookup', 'echo(lookup(1.5, [[0,0],[1,10],[2,20]]));', r => eq(echo(r), ['ECHO: 15']));
check('search', 'echo(search("b","abc"), search(3,[1,2,3]), search([["b"]][0], ["a","b"]));', r => eq(echo(r), ['ECHO: [1], [2], [1]']));
check('rands seed', 'a=rands(0,1,2,42); b=rands(0,1,2,42); echo(a==b);', r => eq(echo(r), ['ECHO: true']));
check('linear_extrude', 'linear_extrude(height=10) square(5);', r => near(E.volume(r.objects), 250, 1e-6));
check('linear_extrude center', 'linear_extrude(height=10, center=true) square(5);', r => near(E.bounds(r.objects)[0][2], -5, 1e-9));
check('linear_extrude scale', 'linear_extrude(height=10, scale=0.5) square(10, center=true);', r => near(E.volume(r.objects), 10/3*(100+25+50), 0.5));
check('linear_extrude twist', 'linear_extrude(height=20, twist=90, slices=20) square(10, center=true);', r => near(E.volume(r.objects), 2000, 60));
check('twist sentido horário (OpenSCAD)', 'linear_extrude(height=10, twist=90, slices=10) square([10,1]);', r => near(E.bounds(r.objects)[0][1], -10, 0.05));
check('rotate_extrude negativo', 'rotate_extrude(angle=-90, $fn=64) translate([10,0]) square(2);', r => { const b = E.bounds(r.objects); near(b[1][1], 0, 1e-6); near(b[0][1], -12, 0.01); });
check('polyhedron aberto avisa', 'polyhedron(points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]], faces=[[0,1,2],[0,3,1]]);', r => { if (!r.warnings.some(w => w.msg.includes('polyhedron'))) throw new Error('sem aviso'); });
check('rotate_extrude torus', 'rotate_extrude($fn=200) translate([10,0]) circle(r=2, $fn=100);', r => near(E.volume(r.objects), 2*Math.PI*Math.PI*10*4, 5));
check('rotate_extrude angle', 'rotate_extrude(angle=90, $fn=200) translate([10,0]) square([2,2]);', r => near(E.volume(r.objects), Math.PI/2*(144-100)/2*2, 1));
check('offset r', 'linear_extrude(1) offset(r=1, $fn=64) square(10);', r => near(E.volume(r.objects), 100+40+Math.PI, 0.2));
check('offset delta', 'linear_extrude(1) offset(delta=1) square(10);', r => near(E.volume(r.objects), 144, 1e-6));
check('polygon with hole', 'linear_extrude(1) polygon(points=[[0,0],[10,0],[10,10],[0,10],[2,2],[8,2],[8,8],[2,8]], paths=[[0,1,2,3],[4,5,6,7]]);', r => near(E.volume(r.objects), 64, 0.01));
check('polygon clockwise', 'linear_extrude(1) polygon([[0,0],[0,10],[10,0]]);', r => near(E.volume(r.objects), 50, 1e-6));
check('polyhedron cube', `polyhedron(points=[[0,0,0],[10,0,0],[10,7,0],[0,7,0],[0,0,5],[10,0,5],[10,7,5],[0,7,5]],
  faces=[[0,1,2,3],[4,5,1,0],[7,6,5,4],[5,6,2,1],[6,7,3,2],[7,4,0,3]]);`, r => near(E.volume(r.objects), 350, 1e-6));
check('hull', 'hull(){ cube(1); translate([10,0,0]) cube(1); }', r => near(E.volume(r.objects), 11, 1e-6));
check('minkowski não convexo', 'minkowski(){ union(){ cube([10,2,2]); cube([2,10,2]); } cube(1, center=true); }', r => near(E.volume(r.objects), 171, 0.01));
check('minkowski', 'minkowski(){ cube([10,10,1]); cylinder(r=1,h=1,$fn=4); }', r => { const b=E.bounds(r.objects); near(b[1][0]-b[0][0], 12, 1e-6); near(b[1][2]-b[0][2], 2, 1e-6); });
check('resize', 'resize([20,0,0], auto=true) cube([10,5,2]);', r => { const b=E.bounds(r.objects); near(b[1][0],20,1e-9); near(b[1][1],10,1e-9); });
check('color', 'color("red") cube(1); color([0,0,1,0.5]) sphere(1);', r => { eq(r.objects[0].color, [1,0,0,1]); eq(r.objects[1].color, [0,0,1,0.5]); });
check('inner color wins', 'color("red") color("azul") cube(1);', r => eq(r.objects[0].color.map(x=>+x.toFixed(3)), [0.118,0.533,0.898,1]));
check('modifier #', 'difference(){ cube(10); #cylinder(h=20,r=2); }', r => { eq(r.objects.length,1); eq(r.ghosts.length,1); eq(r.ghosts[0].ghost,'hl'); });
check('modifier %', '%cube(10); sphere(2);', r => { eq(r.objects.length,1); eq(r.ghosts[0].ghost,'bg'); });
check('modifier *', '*cube(10); sphere(2);', r => eq(r.objects.length,1));
check('modifier !', 'cube(10); translate([50,0,0]) !sphere(2);', r => { eq(r.objects.length,1); near(E.bounds(r.objects)[1][0], 1.8478, 0.01); });
check('text', 'linear_extrude(2) text("Ola", size=10);', r => { const b=E.bounds(r.objects); if (!(b[1][0]-b[0][0] > 15)) throw new Error('largura '+(b[1][0]-b[0][0])); near(b[1][1]-b[0][1], 10, 2.5); });
check('text center', 'linear_extrude(1) text("ABC", size=8, halign="center", valign="center");', r => { const b=E.bounds(r.objects); near(b[0][0]+b[1][0], 0, 1e-6); near(b[0][1]+b[1][1], 0, 1e-6); });
check('projection', 'linear_extrude(1) projection() sphere(5, $fn=32);', r => near(E.volume(r.objects), Math.PI*25, 3));
check('projection cut', 'linear_extrude(1) projection(cut=true) translate([0,0,0]) cube(10, center=true);', r => near(E.volume(r.objects), 100, 0.01));
check('aliases pt', 'diferenca(){ cubo(10); mover([5,5,-1]) cilindro(h=12, r=2, $fn=64); }', r => near(E.volume(r.objects), 1000 - Math.PI*4*10, 1));
check('intersection_for', 'intersection_for(n=[0:2]) rotate([0,0,n*60]) cube([20,4,4], center=true);', r => { if (E.volume(r.objects) <= 0) throw new Error('vazio'); });
check('multmatrix', 'multmatrix([[1,0,0,10],[0,1,0,0],[0,0,1,0]]) cube(1);', r => near(E.bounds(r.objects)[0][0], 10, 1e-9));
check('2d union in diff', 'linear_extrude(2) difference(){ circle(10); for(i=[0:3]) rotate(i*90) translate([6,0]) circle(2); }', r => near(E.volume(r.objects), 536.17, 0.1));
check('unknown module warns', 'foo(); cube(1);', r => { eq(r.objects.length,1); if(!r.warnings.length) throw new Error('sem aviso'); });
check('if/else', 'x=3; if (x>2) cube(1); else sphere(1);', r => near(E.volume(r.objects),1,1e-9));
check('let statement', 'let(a=2, b=a*3) echo(b);', r => eq(echo(r), ['ECHO: 6']));
check('range desc warn', 'echo([for (i=[3:1]) i]);', r => eq(echo(r), ['ECHO: [1, 2, 3]']));
check('neg step', 'echo([for (i=[3:-1:1]) i]);', r => eq(echo(r), ['ECHO: [3, 2, 1]']));
check('index/member', 'v=[1,2,3]; echo(v[1], v.z, "abc"[2]);', r => eq(echo(r), ['ECHO: 2, 3, "c"']));
check('echo named', 'echo(a=1, "b");', r => eq(echo(r), ['ECHO: a = 1, "b"']));
check('round', 'echo(round(2.5), round(-2.5), floor(-1.5));', r => eq(echo(r), ['ECHO: 3, -3, -2']));
check('stl export', 'cube(10); translate([5,0,0]) cube(10);', r => { const b = E.toSTL(r.objects); if (!b || b.byteLength < 84+12*50) throw new Error('stl pequeno'); });
check('svg export', 'square(10); circle(3);', r => { const s = E.toSVG(r.objects); if (!s || !s.includes('<path')) throw new Error('svg'); });

// fontes e bibliotecas
const fsx = require('fs');
const fb = (f) => { const b = fsx.readFileSync(require.resolve('@fontsource/roboto/files/' + f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
if (!E.setFont('Roboto', 'regular', fb('roboto-latin-400-normal.woff'))) throw new Error('fonte não carregou');
E.setFont('Roboto', 'bold', fb('roboto-latin-700-normal.woff'));
const runLibs = (src, libs) => E.run(src, { libs });
check('font por nome', 'linear_extrude(2) text("Hg", size=10, font="Roboto");', r => { if (r.warnings.length) throw new Error(r.warnings[0].msg); const b = E.bounds(r.objects); if (b[1][1] < 9.5 || b[1][1] > 10.6) throw new Error('altura ' + b[1][1]); });
check('font negrito pesa mais', 'linear_extrude(1) text("H", size=10, font="Roboto:style=Bold");', r => { const vb = E.volume(r.objects); const n = E.run('linear_extrude(1) text("H", size=10, font="Roboto");'); if (!(vb > E.volume(n.objects))) throw new Error('negrito não é maior'); });
check('font ausente avisa', 'linear_extrude(1) text("X", font="NaoExiste");', r => { eq(r.fontsWanted, ['NaoExiste']); if (!r.warnings.length) throw new Error('sem aviso'); });
{
  const r = runLibs('include <m.scad>; bloco(10); echo(K, dobro(2));', { 'm.scad': 'K=5; module bloco(t){ cube(t); } function dobro(x)=x*2;' });
  if (r.error || E.volume(r.objects) !== 1000 || r.echoes[0].msg !== 'ECHO: 5, 4') { fails++; console.log('FAIL include'); } else console.log('ok   include');
  const u = runLibs('use <m.scad>; bloco(10); echo(K, dobro(2));', { 'm.scad': 'K=5; module bloco(t){ cube(t*K/5); } function dobro(x)=x*K;' });
  if (u.error || E.volume(u.objects) !== 1000 || u.echoes[0].msg !== 'ECHO: undef, 10') { fails++; console.log('FAIL use', u.echoes.map(e => e.msg)); } else console.log('ok   use');
  const c = runLibs('include <a.scad>; cube(1);', { 'a.scad': 'include <a.scad>;' });
  if (c.error || !c.warnings.length) { fails++; console.log('FAIL ciclo'); } else console.log('ok   ciclo de include');
}
check('recursão final longa', 'function f(n,a=0)= n==0?a:f(n-1,a+1); echo(f(2500));', r => eq(echo(r), ['ECHO: 2500']));

console.log(fails ? `\n${fails} FALHAS` : '\nTODOS OK');
if (fails) process.exit(1);
})();
