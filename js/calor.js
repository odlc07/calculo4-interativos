/* calor.js — controlador do módulo 5.
 *
 * Toda a matemática vive em difusao.js; todo o desenho genérico, em plot.js.
 * Aqui só existe o que amarra os dois ao DOM.
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var D = global.Difusao;

  var N_INICIAL = 64;
  var PASSO_ANIMACAO = 4;          // posições de controle por quadro

  var el = {};
  var estado = {
    condId: 'quadrada',
    modo: 'calor',
    s: 0,                          // posição do controle de tempo
    N: N_INICIAL,
    animando: false
  };
  var pendente = false;

  function cond() { return D.porId(estado.condId); }
  function tempo() { return D.tempoDe(estado.modo, estado.s); }

  // =========================================================================
  // Formatação de número
  // =========================================================================

  var F = global.Formato;
  var expoente = F.expoente;
  var br = F.br;
  var cientifica = F.cientifica;

  function numero(v, casas) { return F.numero(v, { casas: casas }); }

  function tempoTexto(t) {
    if (t === 0) return '0';
    var a = Math.abs(t);
    if (a < 1e-3) return cientifica(t, 2);
    return br(t, a < 0.1 ? 5 : 4);
  }

  // =========================================================================
  // Desenho do perfil
  // =========================================================================

  var MARGEM_PERFIL = { esq: 42, dir: 12, topo: 14, base: 24 };
  var MARGEM_ESPECTRO = { esq: 52, dir: 12, topo: 12, base: 24 };

  var X0 = -1.15 * PI, X1 = 1.15 * PI;

  function escalaPerfil(a, c) {
    return global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_PERFIL,
      x0: X0, x1: X1, y0: c.yMin, y1: c.yMax
    });
  }

  /* Malha em x com os pontos de descontinuidade duplicados: um ponto logo antes
   * e um logo depois de cada salto, e um NaN entre eles. Plot.serie interrompe
   * o traço no valor não finito, e é assim que o degrau é desenhado como degrau
   * em vez de ganhar uma vertical que não existe na função. */
  function malhaComSaltos(c, n) {
    var quebras = D.descontinuidades(c, X0, X1);
    quebras.sort(function (p, q) { return p - q; });
    var eps = (X1 - X0) * 1e-7;
    var xs = [];
    var k = 0;
    for (var i = 0; i <= n; i++) {
      var x = X0 + (X1 - X0) * i / n;
      while (k < quebras.length && quebras[k] <= x) {
        xs.push(quebras[k] - eps, NaN, quebras[k] + eps);
        k++;
      }
      xs.push(x);
    }
    while (k < quebras.length) {
      xs.push(quebras[k] - eps, NaN, quebras[k] + eps);
      k++;
    }
    return xs;
  }

  function desenharPerfil(cores) {
    var c = cond();
    var a = global.Plot.ajustar(el.canvasPerfil);
    var esc = escalaPerfil(a, c);
    var t = tempo();

    global.Plot.eixos(a.ctx, esc, cores, {
      marcasX: [{ v: -PI, rotulo: '−π' }, { v: -PI / 2, rotulo: '−π/2' },
                { v: 0, rotulo: '0' }, { v: PI / 2, rotulo: 'π/2' },
                { v: PI, rotulo: 'π' }],
      marcasY: marcasPerfil(c)
    });

    // a média a_0/2: é o estado final do calor, quando t → ∞
    global.Plot.linhaH(a.ctx, esc, c.a0 / 2, {
      cor: cores.destaque, tracejado: [3, 4], largura: 1
    });

    // condição inicial, em cinza fino, com os saltos abertos
    var xsF = malhaComSaltos(c, Math.max(400, Math.round(esc.pw * 2)));
    var ysF = xsF.map(function (x) { return isNaN(x) ? NaN : c.f(x); });
    global.Plot.serie(a.ctx, esc, xsF, ysF, { cor: cores.referencia, largura: 1 });

    // a solução no instante t
    var P = Math.max(600, Math.round(esc.pw * 3));
    var xs = new Float64Array(P);
    for (var i = 0; i < P; i++) xs[i] = X0 + (X1 - X0) * i / (P - 1);
    var u = D.perfil(c, estado.modo, estado.N, t, xs);

    /* Recortar antes de desenhar: no tempo para trás a amplitude chega a 10¹¹⁰,
     * e mandar uma coordenada dessas para o canvas não desenha nada de útil. O
     * valor cru continua nos indicadores, que é onde ele significa alguma
     * coisa. */
    var folga = (c.yMax - c.yMin) * 0.5;
    var lo = c.yMin - folga, hi = c.yMax + folga;
    var ys = new Float64Array(P);
    for (i = 0; i < P; i++) ys[i] = Math.max(lo, Math.min(hi, u[i]));

    global.Plot.serie(a.ctx, esc, xs, ys, { cor: cores.destaque, largura: 1.7 });
  }

  function marcasPerfil(c) {
    if (c.id === 'serra') {
      return [{ v: -PI, rotulo: '−π' }, { v: 0, rotulo: '0' }, { v: PI, rotulo: 'π' }];
    }
    if (c.id === 'pulso') {
      return [{ v: 0, rotulo: '0' }, { v: 2, rotulo: '2' }, { v: 4, rotulo: '4' }];
    }
    return [{ v: 0, rotulo: '0' }, { v: PI / 2, rotulo: 'π/2' }, { v: PI, rotulo: 'π' }];
  }

  // =========================================================================
  // Desenho do espectro
  // =========================================================================

  var LOG_MIN = -16, LOG_MAX = 1;

  function desenharEspectro(cores) {
    var c = cond();
    var a = global.Plot.ajustar(el.canvasEspectro);
    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_ESPECTRO,
      x0: 0, x1: D.N_MAX + 1, y0: LOG_MIN, y1: LOG_MAX
    });
    var t = tempo();

    var marcasY = [];
    for (var k = LOG_MAX - 1; k >= LOG_MIN; k -= 4) {
      marcasY.push({ v: k, rotulo: '10' + expoente(k) });
    }
    global.Plot.eixos(a.ctx, esc, cores, {
      marcasX: [{ v: 1, rotulo: '1' }, { v: 32, rotulo: '32' }, { v: 64, rotulo: '64' },
                { v: 96, rotulo: '96' }, { v: 128, rotulo: '128' }],
      marcasY: marcasY
    });

    // no tempo para trás os coeficientes crescem: sai da faixa por cima, e a
    // faixa não é esticada — o que interessa é que eles SOBEM
    var esp = D.espectro(c, estado.modo, D.N_MAX, t);

    hastes(a.ctx, esc, esp.ns, esp.mags0, cores.referencia, 1, D.N_MAX);
    hastes(a.ctx, esc, esp.ns, esp.mags, cores.eixo, 1, D.N_MAX);          // descartados
    hastes(a.ctx, esc, esp.ns, esp.mags, cores.destaque, 2, estado.N);     // somados

    global.Plot.linhaV(a.ctx, esc, estado.N + 0.5, {
      cor: cores.limite, rotulo: 'N = ' + estado.N, tracejado: [4, 3]
    });
  }

  /* Hastes verticais do eixo de baixo até log10 do módulo, para n ≤ ate.
   * Coeficientes exatamente nulos — os harmônicos pares da quadrada e da
   * triangular — não têm logaritmo e simplesmente não recebem haste. */
  function hastes(ctx, esc, ns, mags, cor, largura, ate) {
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura;
    ctx.beginPath();
    var piso = esc.py(LOG_MIN);
    for (var i = 0; i < ns.length; i++) {
      if (ns[i] > ate) break;
      var m = mags[i];
      if (!(m > 0)) continue;
      var y = Math.log10(m);
      if (y < LOG_MIN) continue;
      if (y > LOG_MAX) y = LOG_MAX;
      var px = Math.round(esc.px(ns[i])) + 0.5;
      ctx.moveTo(px, piso);
      ctx.lineTo(px, esc.py(y));
    }
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // Indicadores
  // =========================================================================

  function textoIndicador(elemento, texto, ehTexto) {
    elemento.textContent = texto;
    elemento.className = 'numero' + (ehTexto ? ' texto' : '');
  }

  function atualizarIndicadores() {
    var c = cond();
    var t = tempo();

    el.valorT.textContent = tempoTexto(t);
    el.valorN.textContent = String(estado.N);

    // ---- erro de truncamento
    var err = D.erroTruncamento(c, estado.modo, estado.N, t);
    if (err === null) {
      textoIndicador(el.indErro, 'não converge', true);
    } else if (err === 0) {
      textoIndicador(el.indErro, 'abaixo de 10⁻³⁰⁰', true);
    } else if (err >= 1e-4) {
      textoIndicador(el.indErro, F.porcento(err, 2), false);
    } else {
      textoIndicador(el.indErro, cientifica(err), false);
    }

    // ---- termos necessários
    var r = D.termosPara(c, estado.modo, t, 1e-6);
    if (r.diverge) {
      textoIndicador(el.indTermos, 'não converge', true);
      el.indTermosApoio.textContent = 'a série diverge no tempo para trás';
    } else if (r.saturou) {
      textoIndicador(el.indTermos, 'mais de ' + F.inteiro(D.BUSCA_MAX), true);
      el.indTermosApoio.textContent = estado.modo === 'onda'
        ? 'a onda não suaviza: nunca cai'
        : 'em t = 0 seriam da ordem de 10¹²';
    } else {
      textoIndicador(el.indTermos, F.inteiro(r.M), false);
      el.indTermosApoio.textContent = 'bastam para erro relativo < 10⁻⁶';
    }

    // ---- norma relativa
    var norma = D.normaRelativa(c, estado.modo, estado.N, t);
    if (norma === null) {
      textoIndicador(el.indNorma, 'não converge', true);
      el.indNormaApoio.textContent = '—';
    } else {
      textoIndicador(el.indNorma, br(norma, 4), false);
      el.indNormaApoio.textContent = estado.modo === 'onda'
        ? 'oscila: a energia se divide com u_t'
        : 'cai: a energia é dissipada';
    }

    // ---- amplitude
    var amp = D.amplitude(c, estado.modo, estado.N, t);
    textoIndicador(el.indAmplitude, numero(amp, 4), false);
    var foraDaEscala = amp > c.yMax * 1.5;
    el.indAmplitudeApoio.textContent = foraDaEscala
      ? 'fora da escala do gráfico'
      : 'maior |u| sobre o anel';

    // ---- cabeça do painel e aviso
    el.tituloPerfil.textContent = c.nome + ' — ' +
      (estado.modo === 'onda' ? 'onda' : 'calor') + ', t = ' + tempoTexto(t);

    var malPosto = (estado.modo === 'calor' && t < 0);
    el.avisoMalPosto.hidden = !malPosto;

    if (malPosto) {
      el.marcadorPerfil.textContent = 'problema mal-posto';
      el.marcadorPerfil.className = 'marcador nao-satisfaz';
    } else if (estado.modo === 'onda') {
      el.marcadorPerfil.textContent = 'não suaviza: volta em t = 2π';
      el.marcadorPerfil.className = 'marcador';
    } else if (t > 0) {
      el.marcadorPerfil.textContent = 'infinitamente derivável';
      el.marcadorPerfil.className = 'marcador satisfaz';
    } else {
      el.marcadorPerfil.textContent = c.classe;
      el.marcadorPerfil.className = 'marcador';
    }
  }

  var FORMULA_CALOR = 'u(x,t)=\\frac{a_0}{2}+\\sum_{n=1}^{N} e^{-\\alpha n^{2}t}' +
                      '\\bigl(a_n\\cos nx+b_n\\sin nx\\bigr)';
  var FORMULA_ONDA = 'u(x,t)=\\frac{a_0}{2}+\\sum_{n=1}^{N} \\cos(cnt)' +
                     '\\bigl(a_n\\cos nx+b_n\\sin nx\\bigr)';

  function atualizarFormula() {
    var src = estado.modo === 'onda' ? FORMULA_ONDA : FORMULA_CALOR;
    if (el.formulaSolucao.getAttribute('data-math-display') === src) return;
    el.formulaSolucao.setAttribute('data-math-display', src);
    el.formulaSolucao.className = 'formula';
    global.Formulas.renderizarNo(el.formulaSolucao);
  }

  // =========================================================================
  // Ciclo
  // =========================================================================

  function desenhar() {
    var cores = global.Plot.cores(document.body);
    desenharPerfil(cores);
    desenharEspectro(cores);
    atualizarIndicadores();
    atualizarFormula();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function definirAnimacao(ligado) {
    estado.animando = ligado;
    el.botaoAnimar.textContent = ligado ? 'parar' : 'avançar';
    el.botaoAnimar.setAttribute('aria-pressed', ligado ? 'true' : 'false');
  }

  function quadro() {
    if (estado.animando) {
      estado.s += PASSO_ANIMACAO;
      if (estado.s >= D.S_MAX) {
        estado.s = D.S_MAX;
        definirAnimacao(false);
      }
      el.sliderT.value = String(estado.s);
      desenhar();
    }
    global.requestAnimationFrame(quadro);
  }

  // =========================================================================
  // Início
  // =========================================================================

  function montarBotoesCondicao() {
    el.seletorCondicao.textContent = '';
    el.botoesCondicao = [];
    D.CONDICOES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = c.nome;
      b.setAttribute('aria-pressed', c.id === estado.condId ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado.condId = c.id;
        el.botoesCondicao.forEach(function (outro) {
          outro.setAttribute('aria-pressed', outro === b ? 'true' : 'false');
        });
        agendar();
      });
      el.seletorCondicao.appendChild(b);
      el.botoesCondicao.push(b);
    });
  }

  function ligarBotoesEquacao() {
    el.botoesEquacao = [];
    var lista = el.seletorEquacao.querySelectorAll('button[data-modo]');
    for (var i = 0; i < lista.length; i++) {
      (function (b) {
        el.botoesEquacao.push(b);
        b.addEventListener('click', function () {
          estado.modo = b.getAttribute('data-modo');
          el.botoesEquacao.forEach(function (outro) {
            outro.setAttribute('aria-pressed', outro === b ? 'true' : 'false');
          });
          agendar();
        });
      })(lista[i]);
    }
  }

  function iniciar() {
    el.seletorCondicao = document.getElementById('seletor-condicao');
    el.seletorEquacao = document.getElementById('seletor-equacao');
    el.sliderT = document.getElementById('slider-t');
    el.valorT = document.getElementById('valor-t');
    el.sliderN = document.getElementById('slider-n');
    el.valorN = document.getElementById('valor-n');
    el.botaoAnimar = document.getElementById('botao-animar');
    el.botaoReset = document.getElementById('botao-reset');
    el.canvasPerfil = document.getElementById('canvas-perfil');
    el.canvasEspectro = document.getElementById('canvas-espectro');
    el.tituloPerfil = document.getElementById('titulo-perfil');
    el.marcadorPerfil = document.getElementById('marcador-perfil');
    el.formulaSolucao = document.getElementById('formula-solucao');
    el.indErro = document.getElementById('ind-erro');
    el.indTermos = document.getElementById('ind-termos');
    el.indTermosApoio = document.getElementById('ind-termos-apoio');
    el.indNorma = document.getElementById('ind-norma');
    el.indNormaApoio = document.getElementById('ind-norma-apoio');
    el.indAmplitude = document.getElementById('ind-amplitude');
    el.indAmplitudeApoio = document.getElementById('ind-amplitude-apoio');
    el.avisoMalPosto = document.getElementById('aviso-mal-posto');

    el.sliderT.min = String(D.S_MIN);
    el.sliderT.max = String(D.S_MAX);
    el.sliderN.max = String(D.N_MAX);

    montarBotoesCondicao();
    ligarBotoesEquacao();
    global.Formulas.renderizar();

    el.sliderT.addEventListener('input', function () {
      var v = parseInt(el.sliderT.value, 10);
      estado.s = isFinite(v) ? v : 0;
      if (estado.animando) definirAnimacao(false);   // mexer no tempo pausa
      agendar();
    });

    el.sliderN.addEventListener('input', function () {
      var v = parseInt(el.sliderN.value, 10);
      estado.N = (isFinite(v) && v >= 1) ? Math.min(v, D.N_MAX) : 1;
      agendar();
    });

    el.botaoAnimar.addEventListener('click', function () {
      if (!estado.animando && estado.s >= D.S_MAX) {
        estado.s = 0;
        el.sliderT.value = '0';
      }
      definirAnimacao(!estado.animando);
    });

    el.botaoReset.addEventListener('click', function () {
      definirAnimacao(false);
      estado.s = 0;
      estado.N = N_INICIAL;
      el.sliderT.value = '0';
      el.sliderN.value = String(N_INICIAL);
      agendar();
    });

    global.addEventListener('resize', agendar);

    /* Nada se move sozinho nesta página: o botão de avançar começa desligado,
     * inclusive sem motion reduzido. O módulo é sobre controlar o tempo, não
     * sobre assistir a ele passar. */
    definirAnimacao(false);

    global.requestAnimationFrame(quadro);
    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
