/* index.js — miniaturas da página inicial.
 *
 * Cada cartão mostra um quadro estático desenhado pelos mesmos módulos que o
 * interativo usa: nada de imagem pré-renderizada, para a miniatura nunca sair
 * de sincronia com o que a página de destino realmente faz.
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var el = {};
  var pendente = false;
  var epiciclos = null;      // coeficientes da astroide, calculados uma vez
  var rearranjo = null;      // somas parciais do rearranjo, calculadas uma vez

  var MARGEM = { esq: 6, dir: 6, topo: 8, base: 8 };

  // ---- miniatura do módulo 2: quadrada com a orelha de Gibbs ---------------
  function miniaturaConvergencia(c) {
    var a = global.Plot.ajustar(el.miniConv);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM,
      x0: -1.15 * PI, x1: 1.15 * PI, y0: -0.9, y1: PI + 1.0
    });
    var Q = global.Ondas.quadrada;
    var N = 9;               // poucos termos: a orelha fica bem visível

    // patamares da função exata
    a.ctx.save();
    a.ctx.strokeStyle = c.referencia;
    a.ctx.lineWidth = 1;
    for (var k = -2; k <= 1; k++) {
      var x0 = Math.max(k * PI, esc.x0), x1 = Math.min((k + 1) * PI, esc.x1);
      if (x1 <= x0) continue;
      var py = esc.py(Q.f((k + 0.5) * PI));
      a.ctx.beginPath();
      a.ctx.moveTo(esc.px(x0), py);
      a.ctx.lineTo(esc.px(x1), py);
      a.ctx.stroke();
    }
    a.ctx.restore();

    global.Plot.linhaH(a.ctx, esc, PI + global.Ondas.GIBBS, { cor: c.limite, tracejado: [3, 3] });

    var xs = [], n = Math.max(320, Math.round(esc.pw * 2));
    for (var i = 0; i <= n; i++) xs.push(esc.x0 + (esc.x1 - esc.x0) * i / n);
    var ys = xs.map(function (x) { return Q.S(x, N); });
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.6 });
  }

  // ---- miniatura do módulo 1: astroide reconstruída por epiciclos ----------
  function prepararEpiciclos() {
    if (epiciclos) return epiciclos;
    var am = global.Curvas.amostrar('astroide', { N: 256, arco: true });
    epiciclos = global.Fourier.dft(am.re, am.im);
    return epiciclos;
  }

  function miniaturaEpiciclos(c) {
    var a = global.Plot.ajustar(el.miniEpi);
    var lado = Math.min(a.w, a.h);
    var esc = global.Plot.escala({
      w: a.w, h: a.h,
      margem: {
        esq: (a.w - lado) / 2 + 10, dir: (a.w - lado) / 2 + 10,
        topo: (a.h - lado) / 2 + 10, base: (a.h - lado) / 2 + 10
      },
      x0: -1.25, x1: 1.25, y0: -1.25, y1: 1.25
    });

    var coef = prepararEpiciclos();
    var M = 5;

    // curva exata, traço fino cinza ao fundo
    var denso = global.Curvas.reamostrarPorArco('astroide', 400, 3000);
    global.Plot.serie(a.ctx, esc,
      Array.prototype.slice.call(denso.x).concat([denso.x[0]]),
      Array.prototype.slice.call(denso.y).concat([denso.y[0]]),
      { cor: c.referencia, largura: 1 });

    // cadeia de círculos num instante fixo
    var t = 0.55;
    var termos = global.Fourier.termosPorModulo(coef, M);
    var px = 0, py = 0;
    a.ctx.save();
    a.ctx.strokeStyle = c.eixo;
    a.ctx.lineWidth = 1;
    for (var i = 0; i < termos.length; i++) {
      var te = termos[i];
      var ang = te.n * t;
      var cx = px, cy = py;
      px += te.re * Math.cos(ang) - te.im * Math.sin(ang);
      py += te.re * Math.sin(ang) + te.im * Math.cos(ang);
      if (te.mag > 0.02) {
        a.ctx.beginPath();
        a.ctx.arc(esc.px(cx), esc.py(cy),
                  Math.abs(esc.px(te.mag) - esc.px(0)), 0, 2 * PI);
        a.ctx.stroke();
      }
    }
    a.ctx.restore();

    // reconstrução com |n| ≤ M
    var xs = [], ys = [], P = 300;
    for (var p = 0; p <= P; p++) {
      var v = global.Fourier.avaliarParcial(coef, M, 2 * PI * p / P);
      xs.push(v.re); ys.push(v.im);
    }
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.7 });
    global.Plot.ponto(a.ctx, esc, px, py, { cor: c.destaque, raio: 3 });
  }

  // ---- miniatura do módulo 3: teia convergindo para o ponto fixo -----------
  function miniaturaTeia(c) {
    var a = global.Plot.ajustar(el.miniTeia);
    var fn = global.Iteracao.porId('raiz6');
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM,
      x0: -1, x1: 6.5, y0: -1, y1: 6.5
    });

    // diagonal y = x
    global.Plot.serie(a.ctx, esc, [esc.x0, esc.x1], [esc.x0, esc.x1],
                      { cor: c.eixo, largura: 1, tracejado: [3, 3] });

    // y = g(x)
    global.Plot.funcao(a.ctx, esc, function (x) {
      return global.Iteracao.noDominio(fn, x) ? fn.g(x) : NaN;
    }, { cor: c.referencia, largura: 1.4, n: 300 });

    // a teia a partir de um a₀ bem longe do ponto fixo
    var o = global.Iteracao.orbita(fn, 6.2, 14);
    var segs = global.Iteracao.segmentosTeia(o.valores, fn,
                 (esc.x1 - esc.x0) / Math.max(esc.pw, 1));
    a.ctx.save();
    a.ctx.strokeStyle = c.destaque;
    a.ctx.lineWidth = 1.4;
    a.ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      a.ctx.moveTo(esc.px(segs[i].x0), esc.py(segs[i].y0));
      a.ctx.lineTo(esc.px(segs[i].x1), esc.py(segs[i].y1));
    }
    a.ctx.stroke();
    a.ctx.restore();

    global.Plot.ponto(a.ctx, esc, 3, 3, { cor: c.destaque, raio: 4 });
  }

  // ---- miniatura do módulo 4: disco de convergência no plano complexo ------
  function miniaturaGeratriz(c) {
    var a = global.Plot.ajustar(el.miniGer);
    var an = global.Polinomios.analisar([1, 1], [1, 2], 10);   // o caso da P2

    var lado = Math.min(a.w, a.h);
    var esc = global.Plot.escalaIsometrica({
      w: a.w, h: a.h,
      margem: {
        esq: (a.w - lado) / 2 + 8, dir: (a.w - lado) / 2 + 8,
        topo: (a.h - lado) / 2 + 8, base: (a.h - lado) / 2 + 8
      },
      caixa: { x0: -1.3, x1: 1.3, y0: -1.3, y1: 1.3 }, folga: 0.02
    });

    // eixos discretos
    global.Plot.eixos(a.ctx, esc, c, { marcasX: [{ v: 0 }], marcasY: [{ v: 0 }] });

    // o disco de raio R, e as duas raízes
    global.Plot.circulo(a.ctx, esc, 0, 0, an.R, {
      preenchimento: c.destaque, alpha: 0.1, cor: c.destaque, largura: 1.5
    });
    an.raizes.forEach(function (z, i) {
      var minima = (i === an.indiceMinima);
      global.Plot.ponto(a.ctx, esc, z.re, z.im, {
        cor: minima ? c.limite : c.referencia, raio: minima ? 4.5 : 3
      });
    });
  }

  // ---- miniatura do módulo 5: o salto que deixa de existir ----------------
  function miniaturaCalor(c) {
    var a = global.Plot.ajustar(el.miniCalor);
    var D = global.Difusao;
    var cond = D.porId('quadrada');
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM,
      x0: -1.05 * PI, x1: 1.05 * PI, y0: -0.8, y1: PI + 0.8
    });

    // a condição inicial, com os patamares separados nos saltos
    var quebras = D.descontinuidades(cond, esc.x0, esc.x1);
    var xsF = [], ysF = [], n = Math.max(240, Math.round(esc.pw * 2)), k = 0;
    var eps = (esc.x1 - esc.x0) * 1e-7;
    for (var i = 0; i <= n; i++) {
      var x = esc.x0 + (esc.x1 - esc.x0) * i / n;
      while (k < quebras.length && quebras[k] <= x) {
        xsF.push(quebras[k] - eps, NaN, quebras[k] + eps);
        ysF.push(cond.f(quebras[k] - eps), NaN, cond.f(quebras[k] + eps));
        k++;
      }
      xsF.push(x); ysF.push(cond.f(x));
    }
    global.Plot.serie(a.ctx, esc, xsF, ysF, { cor: c.referencia, largura: 1 });

    /* Um instante curto, e só: o suficiente para o salto virar rampa suave sem
     * que a curva já tenha desabado sobre a média. */
    var P = Math.max(320, Math.round(esc.pw * 2));
    var xs = new Float64Array(P);
    for (i = 0; i < P; i++) xs[i] = esc.x0 + (esc.x1 - esc.x0) * i / (P - 1);
    var u = D.perfil(cond, 'calor', 96, 0.004, xs);
    global.Plot.serie(a.ctx, esc, xs, u, { cor: c.destaque, largura: 1.7 });
  }

  // ---- miniatura do módulo 6: as somas parciais se fechando sobre o alvo ---
  function miniaturaRearranjo(c) {
    var a = global.Plot.ajustar(el.miniRe);
    var R = global.Reordenacao;
    var ALVO = 3;
    if (!rearranjo) rearranjo = R.guloso(R.porId('harmonica'), ALVO, 40000);

    var colunas = Math.max(30, Math.round(a.w - MARGEM.esq - MARGEM.dir));
    var env = R.envelope(rearranjo.somas, 1, rearranjo.K, colunas, 'log');
    var f = R.faixa(env, 0.12);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM,
      x0: 0, x1: Math.log10(rearranjo.K),
      y0: Math.min(f.y0, ALVO - 0.4), y1: Math.max(f.y1, ALVO + 0.4)
    });

    /* Mesmo caminho contínuo do módulo 6 (ver desenharEnvelope em
     * rearranjo.js): liga o último valor de cada coluna ao primeiro da
     * seguinte, para a região rala sair como poligonal e não como tracinhos. */
    function altura(v) { return esc.py(Math.max(esc.y0, Math.min(esc.y1, v))); }
    a.ctx.save();
    a.ctx.strokeStyle = c.destaque;
    a.ctx.lineWidth = 1;
    a.ctx.lineJoin = 'round';
    a.ctx.beginPath();
    var iniciado = false;
    for (var col = 0; col < env.colunas; col++) {
      if (env.vazio[col]) continue;
      var px = esc.margem.esq + esc.pw * col / (env.colunas - 1);
      if (iniciado) a.ctx.lineTo(px, altura(env.primeiro[col]));
      else { a.ctx.moveTo(px, altura(env.primeiro[col])); iniciado = true; }
      a.ctx.lineTo(px, altura(env.min[col]));
      a.ctx.lineTo(px, altura(env.max[col]));
      a.ctx.lineTo(px, altura(env.ultimo[col]));
    }
    a.ctx.stroke();
    a.ctx.restore();

    global.Plot.linhaH(a.ctx, esc, ALVO, { cor: c.limite, tracejado: [4, 3] });
  }

  function desenhar() {
    var c = global.Plot.cores(document.body);
    if (el.miniConv) miniaturaConvergencia(c);
    if (el.miniEpi) miniaturaEpiciclos(c);
    if (el.miniTeia) miniaturaTeia(c);
    if (el.miniGer) miniaturaGeratriz(c);
    if (el.miniCalor) miniaturaCalor(c);
    if (el.miniRe) miniaturaRearranjo(c);
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function iniciar() {
    el.miniConv = document.getElementById('mini-convergencia');
    el.miniEpi = document.getElementById('mini-epiciclos');
    el.miniTeia = document.getElementById('mini-teia');
    el.miniGer = document.getElementById('mini-geratriz');
    el.miniCalor = document.getElementById('mini-calor');
    el.miniRe = document.getElementById('mini-rearranjo');
    global.Formulas.renderizar();
    global.addEventListener('resize', agendar);
    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
