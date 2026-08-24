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

  function desenhar() {
    var c = global.Plot.cores(document.body);
    if (el.miniConv) miniaturaConvergencia(c);
    if (el.miniEpi) miniaturaEpiciclos(c);
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function iniciar() {
    el.miniConv = document.getElementById('mini-convergencia');
    el.miniEpi = document.getElementById('mini-epiciclos');
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
