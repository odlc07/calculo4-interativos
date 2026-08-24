/* teia.js — controlador do módulo 3.
 *
 * A matemática vive em iteracao.js; o desenho genérico, em plot.js.
 * Aqui só existe o que amarra os dois ao DOM, ao arraste e à animação.
 */
(function (global) {
  'use strict';

  var ITER_MAX = 40;

  var el = {};
  var estado = {
    funcaoId: 'raiz6',
    a0: 0,
    iteracoes: 12,
    animando: false
  };

  var dados = null;        // depende da função: pontos fixos
  var orb = null;          // depende também de a0: órbita e destino
  var escalaTeia = null;   // guardada para o arraste poder inverter pixel → dado
  var pendente = false;
  var arrastando = false;
  var ultimoQuadro = 0;

  // =========================================================================
  // Cálculo
  // =========================================================================

  function funcao() { return global.Iteracao.porId(estado.funcaoId); }

  function recalcularFuncao() {
    var fn = funcao();
    dados = { fn: fn, fixos: global.Iteracao.pontosFixos(fn) };
    estado.a0 = fn.a0;
    recalcularOrbita();
  }

  function recalcularOrbita() {
    var fn = funcao();
    var o = global.Iteracao.orbita(fn, estado.a0, ITER_MAX);
    o.destino = destinoDa(o);
    orb = o;
  }

  /* Para onde a órbita vai. É o número que responde a crença falsa do topo:
   * arraste a₀ pelo domínio inteiro e ele não se move. */
  function destinoDa(o) {
    if (o.parada === 'dominio') return { tipo: 'dominio', valores: [] };
    if (o.parada === 'escape') return { tipo: 'diverge', valores: [] };
    var p = global.Iteracao.periodo(o.valores, 1e-6, 4);
    var n = o.valores.length;
    var ultimo = o.valores[n - 1];
    if (p >= 2) {
      return { tipo: 'ciclo', periodo: p, valores: o.valores.slice(n - p) };
    }
    /* Preferimos o ponto fixo exato (achado por bissecção até 1e-12) ao último
     * iterado: o limite é 0,642857, não o valor onde a órbita parou. */
    var perto = null, dist = Infinity;
    (dados && dados.fixos ? dados.fixos : []).forEach(function (f) {
      var d = Math.abs(ultimo - f.x);
      if (f.classe === 'atrator' && d < dist) { dist = d; perto = f; }
    });
    if (perto && dist < 1e-3 * Math.max(1, Math.abs(perto.x))) {
      return { tipo: 'ponto', valores: [perto.x] };
    }
    if (o.parada === 'fixo' || p === 1) return { tipo: 'ponto', valores: [ultimo] };
    return { tipo: 'lento', valores: [ultimo] };
  }

  // =========================================================================
  // Desenho — diagrama de teia
  // =========================================================================

  function janelaAtual() {
    var j = funcao().janela;
    // se a₀ foi digitado fora da janela sugerida, a janela acompanha
    var x0 = Math.min(j.x0, estado.a0 - 0.5);
    var x1 = Math.max(j.x1, estado.a0 + 0.5);
    return { x0: x0, x1: x1, y0: j.y0, y1: j.y1 };
  }

  function desenharTeia(c) {
    var a = global.Plot.ajustar(el.canvasTeia);
    var fn = funcao();
    var j = janelaAtual();

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: { esq: 38, dir: 14, topo: 14, base: 26 },
      x0: j.x0, x1: j.x1, y0: j.y0, y1: j.y1
    });
    escalaTeia = esc;

    global.Plot.eixos(a.ctx, esc, c, {
      marcasX: marcasDe(j.x0, j.x1),
      marcasY: marcasDe(j.y0, j.y1)
    });

    // a diagonal y = x
    global.Plot.serie(a.ctx, esc, [j.x0, j.x1], [j.x0, j.x1],
                      { cor: c.eixo, largura: 1, tracejado: [4, 3] });

    // y = g(x), só onde g está definida
    global.Plot.funcao(a.ctx, esc, function (x) {
      return global.Iteracao.noDominio(fn, x) ? fn.g(x) : NaN;
    }, { cor: c.referencia, largura: 1.6, n: Math.max(400, Math.round(esc.pw * 2)) });

    desenharRaizAlgebrica(a.ctx, esc, c, fn);

    // a teia, até a iteração pedida; segmentos menores que um pixel somem
    var umPixel = (esc.x1 - esc.x0) / Math.max(esc.pw, 1);
    var visiveis = orb.valores.slice(0, estado.iteracoes + 1);
    var segs = global.Iteracao.segmentosTeia(visiveis, fn, umPixel);
    a.ctx.save();
    a.ctx.strokeStyle = c.destaque;
    a.ctx.lineWidth = 1.4;
    a.ctx.lineJoin = 'round';
    a.ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      a.ctx.moveTo(esc.px(s.x0), esc.py(s.y0));
      a.ctx.lineTo(esc.px(s.x1), esc.py(s.y1));
    }
    a.ctx.stroke();
    a.ctx.restore();

    // pontos fixos: cheio para atrator, vazado para repulsor
    dados.fixos.forEach(function (p) {
      var cor = p.classe === 'atrator' ? c.destaque : c.limite;
      if (p.classe === 'atrator') {
        global.Plot.ponto(a.ctx, esc, p.x, p.x, { cor: cor, raio: 5 });
      } else {
        a.ctx.save();
        a.ctx.strokeStyle = cor;
        a.ctx.lineWidth = 2;
        a.ctx.beginPath();
        a.ctx.arc(esc.px(p.x), esc.py(p.x), 4.5, 0, 2 * Math.PI);
        a.ctx.stroke();
        a.ctx.restore();
      }
    });

    // marcador de a₀ sobre o eixo horizontal
    desenharMarcadorA0(a.ctx, esc, c);
  }

  /* A raiz espúria: −2 resolve x² − x − 6 = 0, mas g(−2) = √4 = 2 ≠ −2.
   * Desenhamos os dois pontos que deveriam coincidir se −2 fosse ponto fixo —
   * (−2, −2) na diagonal e (−2, g(−2)) na curva — e o vão entre eles. É o vão
   * que mostra por que a raiz não serve. */
  function desenharRaizAlgebrica(ctx, esc, c, fn) {
    var alg = fn.algebrica;
    if (!alg || !el.mostrarEspuria.checked) return;

    alg.espurias.forEach(function (r) {
      if (r < esc.x0 || r > esc.x1) return;
      var gr = fn.g(r);
      if (!isFinite(gr)) return;

      // o vão entre a diagonal e a curva, em x = r
      ctx.save();
      ctx.strokeStyle = c.limite;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(esc.px(r), esc.py(r));
      ctx.lineTo(esc.px(r), esc.py(gr));
      ctx.stroke();
      ctx.restore();

      // × onde o ponto fixo estaria
      ctx.save();
      ctx.strokeStyle = c.limite;
      ctx.lineWidth = 2;
      var px = esc.px(r), py = esc.py(r), d = 5;
      ctx.beginPath();
      ctx.moveTo(px - d, py - d); ctx.lineTo(px + d, py + d);
      ctx.moveTo(px + d, py - d); ctx.lineTo(px - d, py + d);
      ctx.stroke();
      ctx.restore();

      // e o valor que g realmente assume ali
      global.Plot.ponto(ctx, esc, r, gr, { cor: c.referencia, raio: 3 });
      global.Plot.rotulo(ctx, esc, r, gr, 'g(' + fmtNum(r) + ') = ' + fmtNum(gr), {
        cor: c.tintaFraca, dx: 8, dy: -6
      });
      global.Plot.rotulo(ctx, esc, r, r, 'raiz espúria', {
        cor: c.limite, dx: 8, dy: 16
      });
    });
  }

  function desenharMarcadorA0(ctx, esc, c) {
    var y = Math.max(esc.y0, Math.min(esc.y1, 0));
    var px = esc.px(estado.a0), py = esc.py(y);
    ctx.save();
    ctx.fillStyle = c.destaque;
    ctx.beginPath();
    ctx.moveTo(px, py - 7);
    ctx.lineTo(px - 5.5, py - 16);
    ctx.lineTo(px + 5.5, py - 16);
    ctx.closePath();
    ctx.fill();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('a₀', px, py - 18);
    ctx.restore();
  }

  function marcasDe(v0, v1) {
    var span = v1 - v0;
    var passo = Math.pow(10, Math.floor(Math.log(span / 5) / Math.LN10));
    if (span / passo > 12) passo *= 5;
    else if (span / passo > 6) passo *= 2;
    var marcas = [];
    for (var v = Math.ceil(v0 / passo) * passo; v <= v1 + 1e-9; v += passo) {
      var arred = Math.abs(v) < 1e-12 ? 0 : v;
      marcas.push({ v: arred, rotulo: fmtNum(arred) });
    }
    return marcas;
  }

  // =========================================================================
  // Desenho — sequência aₙ contra n
  // =========================================================================

  function desenharSequencia(c) {
    var a = global.Plot.ajustar(el.canvasSeq);
    var vis = orb.valores.slice(0, estado.iteracoes + 1);

    var minY = Infinity, maxY = -Infinity;
    vis.forEach(function (v) {
      if (!isFinite(v)) return;
      var cl = Math.max(-1e4, Math.min(1e4, v));
      minY = Math.min(minY, cl);
      maxY = Math.max(maxY, cl);
    });
    orb.destino.valores.forEach(function (v) {
      minY = Math.min(minY, v); maxY = Math.max(maxY, v);
    });
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    var folga = Math.max((maxY - minY) * 0.15, 0.25);

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: { esq: 38, dir: 14, topo: 12, base: 24 },
      x0: 0, x1: Math.max(estado.iteracoes, 4),
      y0: minY - folga, y1: maxY + folga
    });

    var passo = Math.max(1, Math.round(estado.iteracoes / 8));
    var marcasX = [];
    for (var n = 0; n <= estado.iteracoes; n += passo) marcasX.push({ v: n, rotulo: String(n) });
    global.Plot.eixos(a.ctx, esc, c, { marcasX: marcasX, marcasY: marcasDe(esc.y0, esc.y1) });

    /* A tracejada no destino é o que liga a teia à ideia de limite. Num ciclo
     * de período p desenhamos p linhas — o limite não existe, mas os valores
     * de acumulação existem. */
    if (orb.destino.tipo === 'ponto' || orb.destino.tipo === 'ciclo') {
      orb.destino.valores.forEach(function (v) {
        global.Plot.linhaH(a.ctx, esc, v, {
          cor: c.limite, tracejado: [4, 3], rotulo: fmtNum(v, 4)
        });
      });
    }

    var xs = [], ys = [];
    for (n = 0; n < vis.length; n++) {
      if (!isFinite(vis[n])) continue;
      xs.push(n);
      ys.push(Math.max(esc.y0, Math.min(esc.y1, vis[n])));
    }
    global.Plot.serie(a.ctx, esc, xs, ys, { cor: c.destaque, largura: 1.5 });
    for (var i = 0; i < xs.length; i++) {
      global.Plot.ponto(a.ctx, esc, xs[i], ys[i], { cor: c.destaque, raio: 2.2 });
    }
  }

  // =========================================================================
  // Texto
  // =========================================================================

  function fmtNum(v, casas) {
    if (!isFinite(v)) return '—';
    var d = casas === undefined ? (Math.abs(v) >= 100 ? 0 : (Math.abs(v) >= 10 ? 1 : 3)) : casas;
    var s = v.toFixed(d);
    if (/^-?0(\.0*)?$/.test(s)) s = s.replace('-', '');   // mata o −0
    return s.replace('.', ',').replace('-', '−');
  }

  function atualizarPainel() {
    var fn = funcao();

    el.valorA0.textContent = fmtNum(estado.a0, 4);
    el.valorIter.textContent = String(estado.iteracoes);
    if (document.activeElement !== el.campoA0) el.campoA0.value = String(estado.a0);

    // destino da órbita — o indicador que responde a crença falsa
    var d = orb.destino;
    if (d.tipo === 'ponto') {
      el.indLimite.textContent = fmtNum(d.valores[0], 6);
      el.indLimiteApoio.textContent = 'a órbita converge';
    } else if (d.tipo === 'ciclo') {
      el.indLimite.textContent = 'ciclo de período ' + d.periodo;
      el.indLimiteApoio.textContent = d.valores.map(function (v) { return fmtNum(v, 4); }).join(' ⇄ ');
    } else if (d.tipo === 'diverge') {
      el.indLimite.textContent = 'diverge';
      el.indLimiteApoio.textContent = orb.mensagem;
    } else if (d.tipo === 'dominio') {
      el.indLimite.textContent = 'fora do domínio';
      el.indLimiteApoio.textContent = orb.mensagem;
    } else {
      el.indLimite.textContent = fmtNum(d.valores[0], 6);
      el.indLimiteApoio.textContent = 'ainda longe de estabilizar';
    }
    el.indLimite.classList.toggle('estavel', d.tipo === 'diverge' || d.tipo === 'dominio');

    // pontos fixos
    el.listaFixos.textContent = '';
    if (!dados.fixos.length) {
      var vazio = document.createElement('li');
      vazio.textContent = 'nenhum ponto fixo na janela';
      el.listaFixos.appendChild(vazio);
    }
    dados.fixos.forEach(function (p) {
      var li = document.createElement('li');
      var ponto = document.createElement('span');
      ponto.className = 'fixo-ponto';
      ponto.textContent = 'p = ' + fmtNum(p.x, 6);
      var deriv = document.createElement('span');
      deriv.className = 'fixo-deriv';
      deriv.textContent = "g′(p) = " + fmtNum(p.dg, 4);
      var classe = document.createElement('span');
      classe.className = 'fixo-classe ' + p.classe;
      classe.textContent = p.rotulo;
      li.appendChild(ponto);
      li.appendChild(deriv);
      li.appendChild(classe);
      el.listaFixos.appendChild(li);
    });

    // nota da função e bloco da raiz espúria
    el.notaFuncao.textContent = fn.nota || '';
    el.notaFuncao.hidden = !fn.nota;
    el.blocoEspuria.hidden = !fn.algebrica;
    el.opcaoEspuria.hidden = !fn.algebrica;
    if (fn.algebrica) {
      el.textoEspuria.textContent = fn.algebrica.explicacao;
      el.equacaoEspuria.setAttribute('data-math-display',
        fn.algebrica.equacao + '\\quad\\Longrightarrow\\quad x = ' +
        fn.algebrica.raizes.join(' \\;\\text{ ou }\\; x = '));
    }
  }

  // =========================================================================
  // Arraste de a₀
  // =========================================================================

  function definirA0(v, vindoDoCampo) {
    if (!isFinite(v)) return;
    /* Não grampeamos a₀ no domínio: digitar um valor de fora precisa PRODUZIR
     * a mensagem "a órbita saiu do domínio de g", que é metade do que este
     * módulo tem a ensinar. Só limitamos a faixa numérica para o desenho não
     * explodir. */
    v = Math.max(-1e6, Math.min(1e6, v));
    estado.a0 = v;
    recalcularOrbita();
    if (!vindoDoCampo) el.campoA0.value = String(Math.round(v * 1e6) / 1e6);
    agendar();
  }

  function a0DoEvento(ev) {
    if (!escalaTeia) return null;
    var r = el.canvasTeia.getBoundingClientRect();
    var px = ev.clientX - r.left;
    return global.Plot.inverterX(escalaTeia, px);
  }

  // =========================================================================
  // Ciclo
  // =========================================================================

  function desenhar() {
    var c = global.Plot.cores(document.body);
    desenharTeia(c);
    desenharSequencia(c);
    atualizarPainel();
    global.Formulas.renderizar();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function quadro(agora) {
    if (estado.animando) {
      if (!ultimoQuadro || agora - ultimoQuadro > 260) {
        ultimoQuadro = agora;
        if (estado.iteracoes >= ITER_MAX) {
          definirAnimacao(false);
        } else {
          estado.iteracoes++;
          el.sliderIter.value = String(estado.iteracoes);
          desenhar();
        }
      }
    }
    global.requestAnimationFrame(quadro);
  }

  function definirAnimacao(ligado) {
    estado.animando = ligado;
    if (ligado && estado.iteracoes >= ITER_MAX) estado.iteracoes = 1;
    el.botaoAnimar.textContent = ligado ? 'parar' : 'animar';
    el.botaoAnimar.setAttribute('aria-pressed', ligado ? 'true' : 'false');
    ultimoQuadro = 0;
  }

  // =========================================================================
  // Início
  // =========================================================================

  function montarBotoes() {
    el.seletor.textContent = '';
    el.botoes = [];
    global.Iteracao.FUNCOES.forEach(function (fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = fn.rotulo;
      b.setAttribute('aria-pressed', fn.id === estado.funcaoId ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado.funcaoId = fn.id;
        el.botoes.forEach(function (o) {
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        recalcularFuncao();
        el.campoA0.value = String(estado.a0);
        agendar();
      });
      el.seletor.appendChild(b);
      el.botoes.push(b);
    });
  }

  function iniciar() {
    el.seletor = document.getElementById('seletor-funcao');
    el.campoA0 = document.getElementById('campo-a0');
    el.valorA0 = document.getElementById('valor-a0');
    el.sliderIter = document.getElementById('slider-iteracoes');
    el.valorIter = document.getElementById('valor-iteracoes');
    el.botaoAnimar = document.getElementById('botao-animar');
    el.mostrarEspuria = document.getElementById('check-espuria');
    el.opcaoEspuria = document.getElementById('opcao-espuria');
    el.canvasTeia = document.getElementById('canvas-teia');
    el.canvasSeq = document.getElementById('canvas-sequencia');
    el.indLimite = document.getElementById('ind-limite');
    el.indLimiteApoio = document.getElementById('ind-limite-apoio');
    el.listaFixos = document.getElementById('lista-fixos');
    el.notaFuncao = document.getElementById('nota-funcao');
    el.blocoEspuria = document.getElementById('bloco-espuria');
    el.textoEspuria = document.getElementById('texto-espuria');
    el.equacaoEspuria = document.getElementById('equacao-espuria');

    montarBotoes();
    recalcularFuncao();

    el.campoA0.addEventListener('input', function () {
      var v = parseFloat(el.campoA0.value);
      if (isFinite(v)) definirA0(v, true);
    });

    el.sliderIter.addEventListener('input', function () {
      var v = parseInt(el.sliderIter.value, 10);
      estado.iteracoes = (isFinite(v) && v >= 1) ? Math.min(v, ITER_MAX) : 1;
      if (estado.animando) definirAnimacao(false);
      agendar();
    });

    el.botaoAnimar.addEventListener('click', function () {
      definirAnimacao(!estado.animando);
    });

    el.mostrarEspuria.addEventListener('change', agendar);

    // arraste no canvas
    el.canvasTeia.addEventListener('pointerdown', function (ev) {
      arrastando = true;
      if (el.canvasTeia.setPointerCapture) el.canvasTeia.setPointerCapture(ev.pointerId);
      var v = a0DoEvento(ev);
      if (v !== null) definirA0(v);
      ev.preventDefault();
    });
    el.canvasTeia.addEventListener('pointermove', function (ev) {
      if (!arrastando) return;
      var v = a0DoEvento(ev);
      if (v !== null) definirA0(v);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      el.canvasTeia.addEventListener(t, function () { arrastando = false; });
    });

    /* Teclado no canvas: as setas movem a₀ sem depender de ponteiro. */
    el.canvasTeia.addEventListener('keydown', function (ev) {
      var j = janelaAtual();
      var passo = (j.x1 - j.x0) / (ev.shiftKey ? 200 : 40);
      if (ev.key === 'ArrowLeft') { definirA0(estado.a0 - passo); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { definirA0(estado.a0 + passo); ev.preventDefault(); }
    });

    global.addEventListener('resize', agendar);

    /* Com motion reduzido a animação não começa sozinha — o slider de
     * iterações continua avançando a teia manualmente. */
    var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    definirAnimacao(false);
    if (mq && mq.matches) el.botaoAnimar.title = 'sua preferência de sistema pede menos animação';

    el.campoA0.value = String(estado.a0);
    el.sliderIter.value = String(estado.iteracoes);

    global.requestAnimationFrame(quadro);
    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
