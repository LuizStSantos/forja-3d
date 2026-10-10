# Forja 3D

CAD por código que roda no navegador, compatível com a linguagem do [OpenSCAD](https://openscad.org).
Você escreve a peça em código e vê o resultado em 3D na hora, sem instalar nada.

**Abrir:** https://luizstsantos.github.io/forja-3d/

## O que tem

- **3D ao vivo**: o modelo atualiza enquanto você digita. O cálculo roda em segundo plano, então a tela não trava.
- **Bandeja de formas**: botões para cubo, esfera, cilindro, cone, texto, furar, juntar, mover, girar, repetir e extrudar. Selecione linhas e clique para envolver o código.
- **Parâmetros automáticos**: as variáveis do topo do arquivo viram controles, seguindo as mesmas regras do Customizer do OpenSCAD:
  ```openscad
  /* [Medidas] */
  altura = 20;   // [5:100]
  folga = 0.2;   // [0:0.05:1]
  tipo = "A";    // [A, B, C]
  ```
- **Clique numa peça** no 3D para ir à linha que a criou.
- **Medidas**: dimensões em mm e volume (maciço).
- **Erros em português**, com a linha marcada no editor.
- **Exportação**: STL, OBJ, SVG (corte a laser), PNG e o próprio `.scad`. O STL sai sempre com a malha fechada (sem arestas não-manifold), pronto para o fatiador.
- **Atalhos em português** (opcionais): `cubo`, `esfera`, `cilindro`, `mover`, `girar`, `diferenca`, `uniao`… e cores como `"vermelho"`.
- O rascunho fica salvo no seu navegador.

## Compatibilidade com o OpenSCAD

Funciona: `cube`, `sphere`, `cylinder`, `polyhedron`, `square`, `circle`, `polygon`, `text`,
`translate`, `rotate`, `scale`, `mirror`, `multmatrix`, `resize`, `color`, `offset`,
`union`, `difference`, `intersection`, `hull`, `minkowski`, `linear_extrude`, `rotate_extrude`,
`projection`, módulos, funções, `children()`, `for`, `intersection_for`, `if`, `let`, `each`,
listas `[for (...) ...]`, funções anônimas, `echo`, `assert`, `$fn`/`$fa`/`$fs` e os modificadores `# % * !`.

Ainda não funciona: `include`/`use` de bibliotecas, `import()` de arquivos e `surface()`.
O `text()` usa uma fonte de traço simples e remove acentos.

## Rodar no seu computador

É um site estático. Sirva a pasta com qualquer servidor HTTP:

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

Abrir o `index.html` direto do disco não funciona: o motor 3D é WebAssembly e o navegador só o carrega por http(s).

## Testes do motor

```sh
npm install
npm test
```

Os testes conferem a linguagem, os volumes e se cada exemplo exporta um STL com a malha fechada.

## Como é feito

| Arquivo | O que faz |
|---|---|
| `js/engine.js` | Interpretador da linguagem OpenSCAD (lexer, parser, avaliador) e geração da geometria (3D com Manifold, 2D com Clipper) |
| `js/handler.js`, `js/worker.js` | Renderização em segundo plano (Web Worker) e exportação |
| `js/app.js` | Interface: editor, visualização 3D, parâmetros, console, menus |
| `js/examples.js` | Exemplos prontos |
| `css/forja.css` | Estilo (tema claro e escuro) |

Bibliotecas usadas (em `vendor/`, todas de código aberto):
[Manifold](https://github.com/elalish/manifold) (geometria 3D, o mesmo motor do OpenSCAD atual, Apache-2.0),
[Clipper](http://www.angusj.com/clipper2/Docs/Overview.htm) (geometria 2D, a mesma usada pelo OpenSCAD, Boost),
[JSCAD modeling](https://github.com/jscad/OpenJSCAD.org) (fonte do `text()`, MIT),
[three.js](https://threejs.org) (visualização, MIT) e
[CodeMirror 5](https://codemirror.net/5/) (editor, MIT).
