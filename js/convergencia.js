/* convergencia.js — controlador do módulo 2.
 *
 * Toda a matemática vive em ondas.js; todo o desenho genérico, em plot.js.
 * Aqui só existe o que amarra os dois ao DOM.
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var N_MAX = 200;
  var N_INICIAL = 12;
  var CASAS = 10;                 // casas decimais nas identidades

  var T = global.Ondas.triangular;
  var Q = global.Ondas.quadrada;
  var GIBBS = global.Ondas.GIBBS;

  var el = {};
  var estado = { N: N_INICIAL };
  var metricas = null;
  var pendente = false;

  // =========================================================================
  // Pré-cálculo das métricas por N
  // =========================================================================

  function precomputar() {
    var supT = new Float64Array(N_MAX + 1);
    var gib = new Float64Array(N_MAX + 1);
    var ns = new Float64Array(N_MAX);
    for (var N = 1; N <= N_MAX; N++) {
      supT[N] = T.supErro(N);
      gib[N] = Q.overshoot(N);
      ns[N - 1] = N;
    }
    return { supT: supT, gib: gib, ns: ns };
  }

  // =========================================================================
  // Desenho
  // =========================================================================

  var MARGEM_FUNCAO = { esq: 38, dir: 10, topo: 12, base: 22 };
  var MARGEM_ERRO = { esq: 38, dir: 10, topo: 10, base: 22 };

  /* Malha de x uniforme, mais pontos críticos inseridos à força — os cantos da
   * triangular e os picos de Gibbs da quadrada. Sem isso o pico com N alto cai
   * entre duas amostras e o desenho perde justamente o que interessa. */
  function malhaX(esc, n, criticos) {
    var xs = [];
    for (var i = 0; i <= n; i++) xs.push(esc.x0 + (esc.x1 - esc.x0) * i / n);
    for (var j = 0; j < criticos.length; j++) {
      var x = criticos[j];
      if (x > esc.x0 && x < esc.x1) xs.push(x);
    }
    xs.sort(function (a, b) { return a - b; });
    return xs;
  }

  function avaliar(xs, fn) {
    var ys = new Float64Array(xs.length);
    for (var i = 0; i < xs.length; i++) ys[i] = fn(xs[i]);
    return ys;
  }

  /* Patamares da onda quadrada, desenhados como segmentos entre saltos
   * consecutivos — evita a reta vertical falsa que uma amostragem ingênua
   * desenharia em cima da descontinuidade. */
  function desenharPatamares(ctx, esc, c) {
    var saltos = [];
    var k0 = Math.floor(esc.x0 / PI) - 1, k1 = Math.ceil(esc.x1 / PI) + 1;
    for (var k = k0; k <= k1; k++) saltos.push(k * PI);

    ctx.save();
    ctx.strokeStyle = c.referencia;
    ctx.lineWidth = 1;
    for (var i = 0; i + 1 < saltos.length; i++) {
      var a = Math.max(saltos[i], esc.x0), b = Math.min(saltos[i + 1], esc.x1);
      if (b <= a) continue;
      var y = Q.f((saltos[i] + saltos[i + 1]) / 2);
      var py = esc.py(y);
      ctx.beginPath();
      ctx.moveTo(esc.px(a), py);
      ctx.lineTo(esc.px(b), py);
      ctx.stroke();
    }
    // tracinhos verticais pontilhados marcando os saltos
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = c.grade;
    for (i = 0; i < saltos.length; i++) {
      if (saltos[i] <= esc.x0 || saltos[i] >= esc.x1) continue;
      var px = Math.round(esc.px(saltos[i])) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, esc.py(0));
      ctx.lineTo(px, esc.py(PI));
      ctx.stroke();
    }
    ctx.restore();
  }

  function desenharTriangular(c) {
    var a = global.Plot.ajustar(el.canvasTri);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_FUNCAO,
      x0: -1.25, x1: 1.25, y0: -0.2, y1: 1.32
    });
    global.Plot.eixos(a.ctx, esc, c, {
      marcasX: [{ v: -1, rotulo: '−1' }, { v: 0, rotulo: '0' }, { v: 1, rotulo: '1' }],
      marcasY: [{ v: 0, rotulo: '0' }, { v: 0.5, rotulo: '0,5' }, { v: 1, rotulo: '1' }]
    });

    // f exata, em cinza fino
    global.Plot.funcao(a.ctx, esc, T.f, { cor: c.referencia, largura: 1, n: 600 });

    // soma parcial, no tom de destaque
    var xs = malhaX(esc, Math.max(400, Math.round(esc.pw * 2)), [-1, 0, 1]);
    var N = estado.N;
    var ys = avaliar(xs, function (x) { return T.S(x, N); });
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.7 });

    // onde o erro máximo é atingido
    global.Plot.ponto(a.ctx, esc, 0, T.S(0, N), { cor: c.destaque, raio: 2.5 });
  }

  function desenharQuadrada(c) {
    var a = global.Plot.ajustar(el.canvasQuad);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_FUNCAO,
      x0: -1.25 * PI, x1: 1.25 * PI, y0: -0.85, y1: PI + 0.95
    });
    global.Plot.eixos(a.ctx, esc, c, {
      marcasX: [{ v: -PI, rotulo: '−π' }, { v: 0, rotulo: '0' }, { v: PI, rotulo: 'π' }],
      marcasY: [{ v: 0, rotulo: '0' }, { v: PI / 2, rotulo: 'π/2' }, { v: PI, rotulo: 'π' }]
    });

    desenharPatamares(a.ctx, esc, c);

    // piso onde o overshoot estaciona
    global.Plot.linhaH(a.ctx, esc, PI + GIBBS, {
      cor: c.limite, rotulo: 'π + 0,2811', tracejado: [4, 3]
    });

    var N = estado.N;
    var pico = Q.argOvershoot(N);
    var criticos = [];
    for (var k = -2; k <= 2; k++) {
      criticos.push(k * PI + pico, k * PI - pico);   // picos dos dois lados de cada salto
    }
    var xs = malhaX(esc, Math.max(500, Math.round(esc.pw * 3)), criticos);
    var ys = avaliar(xs, function (x) { return Q.S(x, N); });
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.7 });

    // o pico de Gibbs, marcado: com N alto a orelha fica com 1 px de largura
    global.Plot.ponto(a.ctx, esc, pico, Q.S(pico, N), { cor: c.limite, raio: 2.5 });
  }

  /* Os dois gráficos de erro compartilham a escala vertical, para a comparação
   * ser direta: um mergulha no eixo, o outro se deita na tracejada. */
  var ERRO_Y1 = 0.5;

  function desenharErro(canvas, valores, c, opcoes) {
    var a = global.Plot.ajustar(canvas);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_ERRO,
      x0: 0, x1: N_MAX, y0: 0, y1: ERRO_Y1
    });
    global.Plot.eixos(a.ctx, esc, c, {
      marcasX: [{ v: 1, rotulo: '1' }, { v: 50, rotulo: '50' }, { v: 100, rotulo: '100' },
                { v: 150, rotulo: '150' }, { v: 200, rotulo: '200' }],
      marcasY: [{ v: 0, rotulo: '0' }, { v: 0.25, rotulo: '0,25' }, { v: 0.5, rotulo: '0,50' }]
    });

    if (opcoes.limite !== undefined) {
      global.Plot.linhaH(a.ctx, esc, opcoes.limite, {
        cor: c.limite, rotulo: opcoes.rotuloLimite, tracejado: [4, 3]
      });
    }

    var xs = metricas.ns;
    var ys = valores.subarray(1);
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.7 });
    global.Plot.ponto(a.ctx, esc, estado.N, valores[estado.N], { cor: c.destaque, raio: 3 });
  }

  // =========================================================================
  // Indicadores e identidades
  // =========================================================================

  function br(v, casas) {
    return v.toFixed(casas).replace('.', ',').replace('-', '−');
  }

  function atualizarIndicadores() {
    var N = estado.N;
    el.valorN.textContent = String(N);

    var supT = metricas.supT[N];
    el.indSupTri.textContent = supT >= 1e-4 ? br(supT, 5) : supT.toExponential(2).replace('.', ',');

    el.indSupQuad.textContent = br(PI / 2, 4);

    var g = metricas.gib[N];
    el.indGibbs.textContent = br(g, 4);
    el.indGibbsApoio.textContent = 'limite ' + br(GIBBS, 4) +
      ' = ' + br(100 * global.Ondas.GIBBS_FRACAO, 2) + '% do salto';
  }

  /* Formata a soma parcial destacando o prefixo que já coincide com o exato. */
  function comDigitosCoincidentes(parcial, exato) {
    var a = parcial.toFixed(CASAS), b = exato.toFixed(CASAS);
    var i = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
    var frag = document.createDocumentFragment();
    if (i > 0) {
      var forte = document.createElement('span');
      forte.className = 'coincide';
      forte.textContent = a.slice(0, i).replace('.', ',');
      frag.appendChild(forte);
    }
    if (i < a.length) {
      frag.appendChild(document.createTextNode(a.slice(i).replace('.', ',')));
    }
    // conta só os dígitos, ignorando o separador decimal
    var digitos = a.slice(0, i).replace(/[^0-9]/g, '').length;
    return { fragmento: frag, digitos: digitos };
  }

  function montarIdentidades() {
    var raiz = el.identidades;
    raiz.textContent = '';
    el.linhasIdentidade = [];

    global.Ondas.identidades.forEach(function (idt) {
      var caixa = document.createElement('div');
      caixa.className = 'identidade';

      var origem = document.createElement('span');
      origem.className = 'origem';
      origem.textContent = idt.origem;
      caixa.appendChild(origem);

      var formula = document.createElement('div');
      formula.className = 'formula';
      formula.setAttribute('data-math-display', idt.soma + ' \\;\\longrightarrow\\; ' + idt.limite);
      caixa.appendChild(formula);

      var lp = document.createElement('div');
      lp.className = 'linha-numero';
      var rp = document.createElement('span');
      rp.className = 'rotulo';
      rp.textContent = 'soma parcial';
      var vp = document.createElement('span');
      vp.className = 'valor';
      lp.appendChild(rp); lp.appendChild(vp);
      caixa.appendChild(lp);

      var le = document.createElement('div');
      le.className = 'linha-numero exato';
      var re = document.createElement('span');
      re.className = 'rotulo';
      re.textContent = 'valor exato';
      var ve = document.createElement('span');
      ve.className = 'valor';
      ve.textContent = idt.exato.toFixed(CASAS).replace('.', ',');
      le.appendChild(re); le.appendChild(ve);
      caixa.appendChild(le);

      var casas = document.createElement('p');
      casas.className = 'casas';
      caixa.appendChild(casas);

      raiz.appendChild(caixa);
      el.linhasIdentidade.push({ idt: idt, valor: vp, casas: casas });
    });
  }

  function atualizarIdentidades() {
    var N = estado.N;
    el.linhasIdentidade.forEach(function (linha) {
      var parcial = linha.idt.parcial(N);
      var r = comDigitosCoincidentes(parcial, linha.idt.exato);
      linha.valor.textContent = '';
      linha.valor.appendChild(r.fragmento);
      linha.casas.textContent = r.digitos === 0
        ? 'nenhum dígito coincide ainda'
        : r.digitos + (r.digitos === 1 ? ' dígito coincide' : ' dígitos coincidem');
    });
  }

  // =========================================================================
  // Ciclo
  // =========================================================================

  function desenhar() {
    var c = global.Plot.cores(document.body);
    desenharTriangular(c);
    desenharQuadrada(c);
    desenharErro(el.canvasErroTri, metricas.supT, c, {});
    desenharErro(el.canvasErroQuad, metricas.gib, c, {
      limite: GIBBS, rotuloLimite: '0,2811'
    });
    atualizarIndicadores();
    atualizarIdentidades();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function iniciar() {
    el.slider = document.getElementById('slider-n');
    el.valorN = document.getElementById('valor-n');
    el.reset = document.getElementById('botao-reset');
    el.canvasTri = document.getElementById('canvas-triangular');
    el.canvasQuad = document.getElementById('canvas-quadrada');
    el.canvasErroTri = document.getElementById('canvas-erro-triangular');
    el.canvasErroQuad = document.getElementById('canvas-erro-quadrada');
    el.indSupTri = document.getElementById('ind-sup-tri');
    el.indSupQuad = document.getElementById('ind-sup-quad');
    el.indGibbs = document.getElementById('ind-gibbs');
    el.indGibbsApoio = document.getElementById('ind-gibbs-apoio');
    el.identidades = document.getElementById('identidades');

    metricas = precomputar();
    montarIdentidades();
    global.Formulas.renderizar();   // depois de montar, para pegar as das identidades

    el.slider.addEventListener('input', function () {
      var v = parseInt(el.slider.value, 10);
      estado.N = (isFinite(v) && v >= 1) ? Math.min(v, N_MAX) : 1;
      agendar();
    });
    el.reset.addEventListener('click', function () {
      estado.N = N_INICIAL;
      el.slider.value = String(N_INICIAL);
      agendar();
    });
    global.addEventListener('resize', agendar);

    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
