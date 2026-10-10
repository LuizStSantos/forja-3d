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
- **Medidas e massa**: dimensões em mm, volume e uma estimativa em gramas de PLA.
- **Erros em português**, com a linha marcada no editor.
- **Exportação**: STL, OBJ, SVG (corte a laser), PNG e o próprio `.scad`.
- **Atalhos em português** (opcionais): `cubo`, `esfera`, `cilindro`, `mover`, `girar`, `diferenca`, `uniao`… e cores como `"vermelho"`.
- O rascunho fica salvo no seu navegador.

## Compatibilidade com o OpenSCAD

Funciona: `cube`, `sphere`, `cylinder`, `polyhedron`, `square`, `circle`, `polygon`, `text`,
`translate`, `rotate`, `scale`, `mirror`, `multmatrix`, `resize`, `color`, `offset`,
`union`, `difference`, `intersection`, `hull`, `minkowski`, `linear_extrude`, `rotate_extrude`,
`projection`, módulos, funções, `children()`, `for`, `intersection_for`, `if`, `let`, `each`,
listas `[for (...) ...]`, funções anônimas, `echo`, `assert`, `$fn`/`$fa`/`$fs` e os modificadores `# % * !`.

Ainda não funciona: `include`/`use` de bibliotecas, `import()` de arquivos e `surface()`.
O `text()` usa uma fonte de traço simples e remove acentos, e `minkowski()` em 3D é exato só com formas convexas.

## Rodar no seu computador

É um site estático. Sirva a pasta com qualquer servidor HTTP:

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

Abrir o `index.html` direto do disco também funciona, mas a renderização roda na própria página (sem o modo em segundo plano).

## Testes do motor

```sh
npm install
npm test
```

## Como é feito

| Arquivo | O que faz |
|---|---|
| `js/engine.js` | Interpretador da linguagem OpenSCAD (lexer, parser, avaliador) e geração da geometria |
| `js/handler.js`, `js/worker.js` | Renderização em segundo plano (Web Worker) e exportação |
| `js/app.js` | Interface: editor, visualização 3D, parâmetros, console, menus |
| `js/examples.js` | Exemplos prontos |
| `css/forja.css` | Estilo (tema claro e escuro) |

Bibliotecas usadas (em `vendor/`, todas de código aberto):
[JSCAD modeling](https://github.com/jscad/OpenJSCAD.org) (geometria 3D, MIT),
[Clipper](http://www.angusj.com/clipper2/Docs/Overview.htm) (geometria 2D, a mesma usada pelo OpenSCAD, Boost),
[three.js](https://threejs.org) (visualização, MIT) e
[CodeMirror 5](https://codemirror.net/5/) (editor, MIT).
