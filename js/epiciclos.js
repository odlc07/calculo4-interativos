/* epiciclos.js — controlador do módulo 1.
 *
 * A matemática vive em fourier.js e curvas.js; o desenho genérico, em plot.js.
 * Aqui só existe o que amarra os dois ao DOM e à animação.
 */
(function (global) {
  'use strict';

  var TAU = 2 * Math.PI;
  var N_AMOSTRAS = 512;      // pontos da DFT
  var P_RECON = 1024;        // pontos do traço da reconstrução
  var P_EXATA = 1600;        // pontos da curva exata ao fundo
  var K_MAX = 60;
  var PISO_LOGLOG = 1e-9;    // abaixo disso o coeficiente não entra no gráfico

  var el = {};
  var estado = {
    curvaId: 'astroide',
    K: 8,
    arco: true,
    animando: true,
    t: 0
  };

  var dados = null;   // depende de (curva, arco): amostras, coeficientes, ajuste
  var recon = null;   // depende também de K: traço, erro, enquadramento
  var ultimoQuadro = 0;
  var pendente = false;

  // =========================================================================
  // Cálculo
  // =========================================================================

  /* Curva exata, densa e independente da amostragem escolhida — é a referência
   * cinza ao fundo, e não deve mudar quando o checkbox de arco é desligado. */
  function curvaExata(curva) {
    var xs = new Float64Array(P_EXATA + 1);
    var ys = new Float64Array(P_EXATA + 1);
    for (var i = 0; i <= P_EXATA; i++) {
      var p = curva.param(TAU * i / P_EXATA);
      xs[i] = p[0]; ys[i] = p[1];
    }
    return { xs: xs, ys: ys };
  }

  function recalcularCurva() {
    var curva = global.Curvas.porId(estado.curvaId);
    var am = global.Curvas.amostrar(curva, { N: N_AMOSTRAS, arco: estado.arco });
    var coef = global.Fourier.dft(am.re, am.im);
    var classificacao = global.Fourier.classificarDecaimento(coef);
    dados = {
      curva: curva,
      coef: coef,
      exata: curvaExata(curva),
      ajuste: classificacao.potencia,
      classificacao: classificacao
    };
    recalcularK();
  }

  /* Posições sucessivas da cadeia de epiciclos no instante t.
   * A ordem é por módulo decrescente — escolha VISUAL, para a cadeia ficar
   * legível. A soma matemática continua sendo sobre |n| ≤ K, e a ordem das
   * parcelas não a altera. */
  function cadeia(t, K) {
    var termos = global.Fourier.termosPorModulo(dados.coef, K);
    var pontos = new Array(termos.length + 1);
    var x = 0, y = 0;
    pontos[0] = { x: 0, y: 0, raio: 0, n: null };
    for (var i = 0; i < termos.length; i++) {
      var te = termos[i];
      var ang = te.n * t;
      var c = Math.cos(ang), s = Math.sin(ang);
      x += te.re * c - te.im * s;
      y += te.re * s + te.im * c;
      pontos[i + 1] = { x: x, y: y, raio: te.mag, n: te.n };
    }
    return pontos;
  }

  function recalcularK() {
    var K = estado.K;
    var xs = new Float64Array(P_RECON + 1);
    var ys = new Float64Array(P_RECON + 1);
    for (var p = 0; p <= P_RECON; p++) {
      var v = global.Fourier.avaliarParcial(dados.coef, K, TAU * p / P_RECON);
      xs[p] = v.re; ys[p] = v.im;
    }

    // enquadramento: curva exata, reconstrução e a cadeia em vários instantes
    var b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    function inclui(x, y) {
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
    for (var i = 0; i < dados.exata.xs.length; i++) inclui(dados.exata.xs[i], dados.exata.ys[i]);
    for (i = 0; i <= P_RECON; i++) inclui(xs[i], ys[i]);
    for (var k = 0; k < 24; k++) {
      var cad = cadeia(TAU * k / 24, K);
      for (var j = 0; j < cad.length; j++) inclui(cad[j].x, cad[j].y);
    }
    if (!isFinite(b.x0)) b = { x0: -1, x1: 1, y0: -1, y1: 1 };

    /* Quantos dos 2K+1 termos são de fato não nulos.
     * Sem esse número o slider parece quebrado: a astroide tem simetria de
     * ordem 4, que zera todo n ≢ 1 (mod 4), então +K e −K entram juntos mas só
     * um deles pode ser não nulo — e só quando K é ímpar. O desenho muda de
     * dois em dois, e a causa é a curva, não o controle. */
    var naoNulos = 0;
    var termos = global.Fourier.termosPorModulo(dados.coef, K);
    for (var i = 0; i < termos.length; i++) if (termos[i].mag > PISO_LOGLOG) naoNulos++;

    recon = {
      xs: xs, ys: ys,
      erro: global.Fourier.erroParseval(dados.coef, K),
      naoNulos: naoNulos,
      caixa: b
    };
  }

  // =========================================================================
  // Desenho
  // =========================================================================

  function desenharPrincipal(c) {
    var a = global.Plot.ajustar(el.canvas);
    var esc = global.Plot.escalaIsometrica({
      w: a.w, h: a.h, margem: { esq: 8, dir: 8, topo: 8, base: 8 }, caixa: recon.caixa
    });
    var ctx = a.ctx;
    var porUnidade = Math.abs(esc.px(1) - esc.px(0));

    // curva exata, traço fino cinza ao fundo
    global.Plot.serie(ctx, esc, dados.exata.xs, dados.exata.ys,
                      { cor: c.referencia, largura: 1 });

    // cadeia de círculos e vetores, em cinza
    var cad = cadeia(estado.t, estado.K);
    ctx.save();
    ctx.lineWidth = 1;
    for (var i = 0; i + 1 < cad.length; i++) {
      var de = cad[i], para = cad[i + 1];
      var raioPx = para.raio * porUnidade;
      if (raioPx > 1.2) {
        ctx.strokeStyle = c.grade;
        ctx.beginPath();
        ctx.arc(esc.px(de.x), esc.py(de.y), raioPx, 0, TAU);
        ctx.stroke();
      }
      if (raioPx > 0.8) {
        ctx.strokeStyle = c.eixo;
        ctx.beginPath();
        ctx.moveTo(esc.px(de.x), esc.py(de.y));
        ctx.lineTo(esc.px(para.x), esc.py(para.y));
        ctx.stroke();
      }
    }
    ctx.restore();

    // traço da reconstrução, em cor de destaque
    global.Plot.serie(ctx, esc, recon.xs, recon.ys, { cor: c.destaque, largura: 1.8 });

    // ponta da cadeia
    var ponta = cad[cad.length - 1];
    global.Plot.ponto(ctx, esc, ponta.x, ponta.y, { cor: c.destaque, raio: 3.5 });
  }

  /* Gráfico log-log de |f̂(n)| contra n, com a reta ajustada sobreposta.
   * Desenhado à mão: são umas quarenta linhas de canvas. */
  function desenharEspectro(c) {
    var a = global.Plot.ajustar(el.canvasEspectro);
    var coef = dados.coef;
    var nMax = coef.N / 2 - 1;

    // extremos em log10
    var maxMag = 0;
    for (var n = 1; n <= nMax; n++) {
      var m = global.Fourier.coeficiente(coef, n).mag;
      if (m > maxMag) maxMag = m;
    }
    if (!(maxMag > 0)) maxMag = 1;
    var yTopo = Math.ceil(Math.log(maxMag) / Math.LN10);
    var yBase = Math.log(PISO_LOGLOG) / Math.LN10;

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: { esq: 42, dir: 12, topo: 12, base: 24 },
      x0: 0, x1: Math.log(nMax) / Math.LN10,
      y0: yBase, y1: yTopo
    });

    var marcasX = [1, 2, 5, 10, 20, 50, 100, 200].filter(function (v) { return v <= nMax; })
      .map(function (v) { return { v: Math.log(v) / Math.LN10, rotulo: String(v) }; });
    var marcasY = [];
    for (var e = Math.ceil(yBase); e <= yTopo; e++) {
      if ((yTopo - e) % 2 === 0 || yTopo - yBase < 6) {
        marcasY.push({ v: e, rotulo: e === 0 ? '1' : '10' + sobrescrito(e) });
      }
    }
    global.Plot.eixos(a.ctx, esc, c, { marcasX: marcasX, marcasY: marcasY });

    // faixa usada no ajuste
    var aj = dados.ajuste;
    if (aj.ok) {
      a.ctx.save();
      a.ctx.fillStyle = c.destaque;
      a.ctx.globalAlpha = 0.07;
      var fx0 = esc.px(Math.log(2) / Math.LN10);
      var fx1 = esc.px(Math.log(Math.min(48, nMax)) / Math.LN10);
      a.ctx.fillRect(fx0, esc.margem.topo, fx1 - fx0, esc.ph);
      a.ctx.restore();
    }

    // pontos: um por n com |f̂(n)| acima do piso
    a.ctx.save();
    a.ctx.fillStyle = c.referencia;
    var plotados = 0;
    for (n = 1; n <= nMax; n++) {
      var mag = global.Fourier.coeficiente(coef, n).mag;
      if (!(mag > PISO_LOGLOG)) continue;    // simetria zera muitos: log(0) fora
      var px = esc.px(Math.log(n) / Math.LN10);
      var py = esc.py(Math.log(mag) / Math.LN10);
      if (py < esc.margem.topo || py > esc.margem.topo + esc.ph) continue;
      a.ctx.beginPath();
      a.ctx.arc(px, py, 1.6, 0, TAU);
      a.ctx.fill();
      plotados++;
    }
    a.ctx.restore();

    /* Corte em |n| ≤ K. É esta linha que explica o slider "pular": quando ela
     * varre uma região sem pontos, nada muda no desenho porque os coeficientes
     * ali são exatamente nulos. */
    if (estado.K >= 1 && estado.K <= nMax) {
      global.Plot.linhaV(a.ctx, esc, Math.log(estado.K) / Math.LN10, {
        cor: c.destaque, rotulo: 'K = ' + estado.K, tracejado: [3, 3]
      });
    }

    /* Os modelos ajustados. Uma lei de potência é reta em log-log; um
     * decaimento exponencial é uma CURVA em log-log, cada vez mais íngreme.
     * Quando os dois ajustes empatam, desenhamos ambos: ver as duas linhas
     * praticamente sobrepostas é o argumento de que a faixa não decide. */
    var cl = dados.classificacao;
    var n0 = 2, n1 = Math.min(48, nMax);
    var mostraPot = cl.modelo === 'potencia' || cl.modelo === 'indeciso';
    var mostraExp = cl.modelo === 'exponencial' || cl.modelo === 'indeciso';

    if (mostraPot && cl.potencia.ok) {
      tracarModelo(a.ctx, esc, n0, n1, function (n) {
        return cl.potencia.intercepto + cl.potencia.expoente * Math.log(n);
      }, { cor: c.limite, largura: 1.6 });
    }
    if (mostraExp && cl.exponencial.ok) {
      tracarModelo(a.ctx, esc, n0, n1, function (n) {
        return cl.exponencial.intercepto + cl.exponencial.taxa * n;
      }, { cor: c.limite, largura: 1.6,
           tracejado: cl.modelo === 'indeciso' ? [5, 3] : null });
    }

    return plotados;
  }

  /* Traça um modelo de decaimento no plano log-log. `logMag` devolve
   * log natural de |f̂(n)|; a conversão para base 10 acontece aqui. */
  function tracarModelo(ctx, esc, n0, n1, logMag, opcoes) {
    var P = 80, xs = [], ys = [];
    for (var i = 0; i <= P; i++) {
      var n = n0 * Math.pow(n1 / n0, i / P);       // passo geométrico
      xs.push(Math.log(n) / Math.LN10);
      ys.push(logMag(n) / Math.LN10);
    }
    global.Plot.serie(ctx, esc, xs, ys, opcoes);
  }

  function sobrescrito(e) {
    var mapa = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                 '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return String(e).split('').map(function (ch) { return mapa[ch] || ch; }).join('');
  }

  // =========================================================================
  // Indicadores
  // =========================================================================

  function atualizarIndicadores() {
    var K = estado.K;
    el.valorK.textContent = String(K);
    el.indTermos.textContent = String(2 * K + 1);
    var nn = recon.naoNulos;
    el.indTermosApoio.textContent = '2K + 1, dos quais ' + nn +
      (nn === 1 ? ' não nulo' : ' não nulos');

    // erro de Parseval em porcentagem, com 2 casas
    var pct = 100 * recon.erro;
    el.indErro.textContent = pct.toFixed(2).replace('.', ',') + '%';

    var cl = dados.classificacao;
    var aj = cl.potencia;

    if (aj.ok) {
      el.indExpoente.textContent = aj.expoente.toFixed(2).replace('.', ',').replace('-', '−');
      el.indExpoenteApoio.textContent = 'R² = ' + aj.r2.toFixed(3).replace('.', ',') +
                                        ' em ' + aj.pontos + ' pontos';
    } else {
      el.indExpoente.textContent = '—';
      el.indExpoenteApoio.textContent = aj.pontos + ' de 5 pontos mínimos no ajuste';
    }
    /* Vermelho quando o expoente NÃO descreve a curva: numa curva analítica o
     * decaimento é exponencial, e a reta em log-log mede algo que não existe. */
    el.indExpoente.classList.toggle('estavel', cl.modelo !== 'potencia');

    el.indModelo.textContent = cl.rotulo;
    if (cl.potencia.ok && cl.exponencial.ok) {
      el.indModeloApoio.textContent = 'R² potência ' + cl.potencia.r2.toFixed(3).replace('.', ',') +
        ' · exponencial ' + cl.exponencial.r2.toFixed(3).replace('.', ',');
    } else {
      el.indModeloApoio.textContent = 'sem pontos suficientes para comparar';
    }

    var prev = dados.curva.previsto;
    el.indPrevisto.textContent = prev.rotulo;
    el.indPrevistoApoio.textContent = prev.razao;
    // concorda quando o modelo bate; "indeciso" não é desacordo
    var concorda = (cl.modelo === prev.modelo) || cl.modelo === 'indeciso';
    el.indPrevisto.classList.toggle('estavel', !concorda);
  }

  // =========================================================================
  // Ciclo de animação
  // =========================================================================

  function desenhar() {
    var c = global.Plot.cores(document.body);
    desenharPrincipal(c);
    desenharEspectro(c);
    atualizarIndicadores();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function quadro(agora) {
    if (estado.animando) {
      var dt = ultimoQuadro ? Math.min((agora - ultimoQuadro) / 1000, 0.1) : 0;
      estado.t = (estado.t + dt * TAU / 12) % TAU;   // uma volta a cada 12 s
      el.sliderT.value = String(Math.round(estado.t / TAU * 1000));
      desenhar();
    }
    ultimoQuadro = agora;
    global.requestAnimationFrame(quadro);
  }

  function definirAnimacao(ligado) {
    estado.animando = ligado;
    el.botaoPausar.textContent = ligado ? 'pausar' : 'continuar';
    el.botaoPausar.setAttribute('aria-pressed', ligado ? 'false' : 'true');
  }

  // =========================================================================
  // Início
  // =========================================================================

  function montarBotoesCurva() {
    el.seletor.textContent = '';
    el.botoesCurva = [];
    global.Curvas.CURVAS.forEach(function (curva) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = curva.nome;
      b.setAttribute('aria-pressed', curva.id === estado.curvaId ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado.curvaId = curva.id;
        el.botoesCurva.forEach(function (o) {
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        recalcularCurva();
        agendar();
      });
      el.seletor.appendChild(b);
      el.botoesCurva.push(b);
    });
  }

  function iniciar() {
    el.seletor = document.getElementById('seletor-curva');
    el.sliderK = document.getElementById('slider-k');
    el.valorK = document.getElementById('valor-k');
    el.sliderT = document.getElementById('slider-t');
    el.botaoPausar = document.getElementById('botao-pausar');
    el.checkArco = document.getElementById('check-arco');
    el.canvas = document.getElementById('canvas-epiciclos');
    el.canvasEspectro = document.getElementById('canvas-espectro');
    el.indTermos = document.getElementById('ind-termos');
    el.indTermosApoio = document.getElementById('ind-termos-apoio');
    el.indErro = document.getElementById('ind-erro');
    el.indExpoente = document.getElementById('ind-expoente');
    el.indExpoenteApoio = document.getElementById('ind-expoente-apoio');
    el.indModelo = document.getElementById('ind-modelo');
    el.indModeloApoio = document.getElementById('ind-modelo-apoio');
    el.indPrevisto = document.getElementById('ind-previsto');
    el.indPrevistoApoio = document.getElementById('ind-previsto-apoio');

    montarBotoesCurva();
    recalcularCurva();
    global.Formulas.renderizar();

    el.sliderK.addEventListener('input', function () {
      var v = parseInt(el.sliderK.value, 10);
      estado.K = (isFinite(v) && v >= 1) ? Math.min(v, K_MAX) : 1;
      recalcularK();
      agendar();
    });

    el.sliderT.addEventListener('input', function () {
      var v = parseInt(el.sliderT.value, 10);
      estado.t = (isFinite(v) ? v : 0) / 1000 * TAU;
      if (estado.animando) definirAnimacao(false);   // mexer no tempo pausa
      agendar();
    });

    el.botaoPausar.addEventListener('click', function () {
      definirAnimacao(!estado.animando);
    });

    el.checkArco.addEventListener('change', function () {
      estado.arco = !!el.checkArco.checked;
      recalcularCurva();
      agendar();
    });

    global.addEventListener('resize', agendar);

    /* Com motion reduzido a animação não roda sozinha: o usuário avança pelo
     * slider de posição, que continua plenamente funcional. */
    var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    definirAnimacao(!(mq && mq.matches));

    el.checkArco.checked = estado.arco;
    el.sliderK.value = String(estado.K);

    global.requestAnimationFrame(quadro);
    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
