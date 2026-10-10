(function (root) {
const EXAMPLES = [
{
id: 'caixa', title: 'Caixa organizadora', desc: 'Parâmetros, offset e difference',
code: `// Bem-vindo ao Forja 3D!
// Mexa nos controles em "Parâmetros" ou edite o código.
// Ctrl+Enter renderiza. Clique numa peça no 3D para achar a linha dela.

/* [Caixa] */
// Largura (mm)
largura = 60; // [20:150]
// Profundidade (mm)
profundidade = 40; // [20:150]
// Altura (mm)
altura = 25; // [10:80]
// Espessura da parede (mm)
parede = 2; // [1:0.5:6]
// Raio dos cantos (mm)
raio = 5; // [0:0.5:15]

/* [Detalhes] */
// Divisória no meio
divisoria = true;
cor_caixa = "laranja"; // [laranja, azul, verde, roxo, cinza]

$fn = 48;

module retangulo_arredondado(x, y, r) {
  if (r > 0)
    offset(r = r) square([x - 2*r, y - 2*r], center = true);
  else
    square([x, y], center = true);
}

color(cor_caixa) {
  difference() {
    linear_extrude(altura)
      retangulo_arredondado(largura, profundidade, raio);
    translate([0, 0, parede])
      linear_extrude(altura)
        retangulo_arredondado(largura - 2*parede, profundidade - 2*parede, max(raio - parede, 0));
  }
  if (divisoria)
    translate([-parede/2, -profundidade/2 + parede/2, 0])
      cube([parede, profundidade - parede, altura * 0.8]);
}
`},
{
id: 'formas', title: 'Formas básicas', desc: 'Cubo, esfera, cilindro, cone e texto',
code: `// As formas básicas do OpenSCAD.
// Experimente trocar os números e as cores!

color("vermelho") cube([10, 10, 10]);

color("azul") translate([22, 5, 6]) sphere(r = 6, $fn = 48);

color("verde") translate([40, 5, 0]) cylinder(h = 12, r = 5, $fn = 48);

// cone: raio de baixo (r1) e de cima (r2)
color("amarelo") translate([58, 5, 0]) cylinder(h = 12, r1 = 6, r2 = 0, $fn = 48);

color("roxo") translate([72, 0, 0]) linear_extrude(3) text("Oi!", size = 12);

// Dica: coloque # na frente de uma forma para destacá-la
`},
{
id: 'suporte', title: 'Suporte de celular', desc: 'Perfil 2D extrudado',
code: `// Suporte de celular: desenha o perfil em 2D e extruda na largura.

// Largura do suporte (mm)
largura = 70; // [40:120]
// Inclinação do encosto (graus)
angulo = 65; // [45:85]
// Espessura das paredes (mm)
espessura = 4; // [3:0.5:8]
// Espessura do celular com capinha (mm)
celular = 11; // [7:0.5:18]

module perfil() {
  // base
  square([85, espessura]);
  // encosto inclinado
  translate([60, 0]) rotate(angulo) square([95, espessura]);
  // reforço triangular
  polygon([[60, 0], [85, 0], [60 + 45*cos(angulo), 45*sin(angulo)]]);
  // apoio da frente
  x_apoio = 60 - (celular + espessura) / sin(angulo) - espessura;
  translate([x_apoio, 0]) square([espessura, 14]);
}

color("cinza")
difference() {
  rotate([90, 0, 0])
    linear_extrude(height = largura, center = true)
      perfil();
  // passagem para o cabo
  translate([45, 0, -1]) cylinder(h = 20, r = 6, $fn = 40);
}
`},
{
id: 'engrenagem', title: 'Engrenagem', desc: 'for, funções e polygon',
code: `// Engrenagem simples (dentes trapezoidais)

// Número de dentes
dentes = 20; // [8:60]
// Módulo (tamanho do dente)
modulo = 2; // [0.5:0.5:5]
// Espessura (mm)
espessura = 6; // [2:20]
// Diâmetro do furo central (mm)
furo = 6; // [0:0.5:30]

r_primitivo = dentes * modulo / 2;
r_externo = r_primitivo + modulo;
r_raiz = r_primitivo - 1.25 * modulo;
passo = 360 / dentes;

function ponto(r, a) = [r * cos(a), r * sin(a)];

module dente() {
  polygon([
    ponto(r_raiz - 1, -passo * 0.32),
    ponto(r_raiz,     -passo * 0.27),
    ponto(r_externo,  -passo * 0.11),
    ponto(r_externo,   passo * 0.11),
    ponto(r_raiz,      passo * 0.27),
    ponto(r_raiz - 1,  passo * 0.32)
  ]);
}

color("dourado")
linear_extrude(espessura)
  difference() {
    union() {
      circle(r = r_raiz, $fn = dentes * 4);
      for (i = [0 : dentes - 1])
        rotate(i * passo) dente();
    }
    if (furo > 0) circle(d = furo, $fn = 40);
  }

echo(str("Diâmetro externo: ", 2 * r_externo, " mm"));
`},
{
id: 'vaso', title: 'Vaso torcido', desc: 'linear_extrude com twist e scale',
code: `// Vaso torcido: uma estrela extrudada com torção e afunilamento

altura = 110; // [40:200]
raio = 35; // [15:60]
pontas = 7; // [3:12]
// Torção total (graus)
torcao = 120; // [0:360]
// Escala do topo
afunilar = 0.75; // [0.3:0.05:1.5]
parede = 2; // [1:0.5:5]

module estrela(r, n) {
  pts = [for (i = [0 : 2*n - 1])
           let(rr = (i % 2 == 0) ? r : r * 0.8, a = i * 180 / n)
             [rr * cos(a), rr * sin(a)]];
  offset(r = 3, $fn = 16) offset(delta = -3) polygon(pts);
}

module corpo(recuo) {
  linear_extrude(height = altura, twist = torcao, scale = afunilar, slices = 40)
    offset(delta = -recuo) estrela(raio, pontas);
}

color("roxo")
difference() {
  corpo(0);
  translate([0, 0, parede]) corpo(parede);
}
`},
{
id: 'chaveiro', title: 'Chaveiro com nome', desc: 'hull e text',
code: `// Chaveiro com nome em relevo

nome = "FORJA";
// Altura das letras (mm)
tamanho = 10; // [5:20]
espessura = 3; // [1.5:0.5:6]
margem = 4; // [2:10]
cor_letras = "branco"; // [branco, preto, amarelo, vermelho]

$fn = 40;
comprimento = len(nome) * tamanho * 0.78;
r = tamanho / 2 + margem;

color("azul")
difference() {
  hull() {
    cylinder(h = espessura, r = r);
    translate([comprimento + r, 0, 0]) cylinder(h = espessura, r = r);
  }
  // furo da argola
  translate([0, 0, -1]) cylinder(h = espessura + 2, r = 2.5);
}

color(cor_letras)
  translate([r * 0.6 + (comprimento + r) / 2, 0, espessura])
    linear_extrude(1.2)
      text(nome, size = tamanho, halign = "center", valign = "center");
`},
{
id: 'taca', title: 'Taça', desc: 'rotate_extrude de um perfil',
code: `// Taça: um perfil 2D girado em torno do eixo Z

altura = 90; // [50:150]
raio_boca = 35; // [20:60]
parede = 2; // [1:0.5:4]
$fn = 96;

perfil = [
  [0, 0], [30, 0], [30, 3], [6, 6], [4, altura * 0.45],
  [raio_boca * 0.6, altura * 0.6], [raio_boca, altura],
  [raio_boca - parede, altura],
  [raio_boca * 0.6 - parede, altura * 0.6 + parede],
  [0, altura * 0.48]
];

color("lightblue", 0.85)
  rotate_extrude() polygon(perfil);
`},
{
id: 'grade', title: 'Placa com furos', desc: 'for duplo dentro de difference',
code: `// Placa perfurada: dois laços for dentro de difference()

colunas = 6; // [1:12]
linhas = 4; // [1:12]
espaco = 12; // [6:30]
diametro = 6; // [2:0.5:10]
espessura = 3; // [1:10]

difference() {
  cube([colunas * espaco, linhas * espaco, espessura]);
  for (i = [0 : colunas - 1], j = [0 : linhas - 1])
    translate([espaco/2 + i * espaco, espaco/2 + j * espaco, -1])
      cylinder(h = espessura + 2, d = diametro, $fn = 32);
}
`},
{
id: 'porca', title: 'Porca sextavada', desc: 'cylinder com $fn = 6',
code: `// Porca sextavada (medidas aproximadas de uma M8)

diametro_furo = 8; // [3:0.5:20]
// Distância entre faces (chave)
chave = 13; // [5:30]
altura = 6.5; // [2:0.5:15]

R = chave / 2 / cos(30); // raio até o vértice

difference() {
  intersection() {
    cylinder(h = altura, r = R, $fn = 6);
    // chanfro nas duas faces
    union() {
      cylinder(h = altura / 2, r1 = R * 0.92, r2 = R * 0.92 + altura / 2, $fn = 48);
      translate([0, 0, altura / 2])
        cylinder(h = altura / 2, r1 = R * 0.92 + altura / 2, r2 = R * 0.92, $fn = 48);
    }
  }
  translate([0, 0, -1]) cylinder(h = altura + 2, d = diametro_furo, $fn = 48);
}
`},
];
if (typeof module === 'object' && module.exports) module.exports = EXAMPLES; else root.FORJA_EXAMPLES = EXAMPLES;
})(typeof self !== 'undefined' ? self : this);
