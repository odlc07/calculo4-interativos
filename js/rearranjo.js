/* rearranjo.js — controlador do módulo 6.
 *
 * Toda a matemática vive em reordenacao.js; todo o desenho genérico, em
 * plot.js; a formatação de número, em formato.js. Aqui só existe o que amarra
 * os três ao DOM.
 */
(function (global) {
  'use strict';

  var R = global.Reordenacao;
  var F = global.Formato;

  var K_MIN = 100;
  var S_MAX = 1000;                // posições do controle de termos

  var ALVOS_PRONTOS = [
    { rotulo: 'π', valor: Math.PI },
    { rotulo: '3', valor: 3 },
    { rotulo: '0', valor: 0 },
    { rotulo: '−2', valor: -2 },
    { rotulo: 'ln 2', valor: Math.LN2 }
  ];

  var PADRAO = { serieId: 'harmonica', modo: 'alvo', alvo: 3, p: 2, q: 1, sK: 700 };

  var el = {};
  var estado = {
    serieId: PADRAO.serieId,
    modo: PADRAO.modo,
    alvo: PADRAO.alvo,
    p: PADRAO.p,
    q: PADRAO.q,
    sK: PADRAO.sK
  };
  var resultado = null;
  var pendente = false;

  function serie() { return R.porId(estado.serieId); }

  /* Controle de termos logarítmico, de 100 a 200 000. A convergência do
   * rearranjo é de ordem 1/K: linear, o controle passaria a maior parte do
   * curso num regime em que o quarto dígito já não se move. */
  function termos() {
    var e = Math.max(0, Math.min(S_MAX, estado.sK)) / S_MAX;
    return Math.round(K_MIN * Math.pow(R.K_MAX / K_MIN, e));
  }

  function recalcular() {
    var s = serie();
    resultado = estado.modo === 'blocos'
      ? R.blocos(s, estado.p, estado.q, termos())
      : R.guloso(s, estado.alvo, termos());
  }

  /* O valor para o qual o rearranjo deveria convergir. No modo do alvo é o
   * próprio alvo — quando a série permite alcançá-lo. */
  function previsto() {
    if (estado.modo === 'blocos') return resultado.previsto;
    return estado.alvo;
  }

  // =========================================================================
  // Desenho
  // =========================================================================

  var MARGEM_SOMAS = { esq: 52, dir: 12, topo: 14, base: 26 };
  var MARGEM_CAUDA = { esq: 52, dir: 12, topo: 10, base: 24 };

  /* Faixa vertical: a do envelope, esticada o bastante para caber a linha do
   * limite e a da soma na ordem original. Sem isso, uma delas cairia fora e o
   * leitor concluiria que o rearranjo passou longe quando foi o corte do
   * gráfico que escondeu a referência. */
  function faixaCom(env, valores) {
    var f = R.faixa(env, 0.1);
    if (!f) return { y0: -1, y1: 1 };
    var y0 = f.y0, y1 = f.y1;
    for (var i = 0; i < valores.length; i++) {
      var v = valores[i];
      if (!isFinite(v)) continue;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
    var folga = 0.06 * ((y1 - y0) || 1);
    return { y0: y0 - folga, y1: y1 + folga };
  }

  /* O envelope, desenhado como uma barra vertical por coluna de pixel. */
  function desenharEnvelope(ctx, esc, env, cor) {
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 0; c < env.colunas; c++) {
      if (env.vazio[c]) continue;
      var px = esc.margem.esq + (env.colunas === 1 ? 0 : esc.pw * c / (env.colunas - 1));
      px = Math.round(px) + 0.5;
      var lo = Math.max(esc.y0, Math.min(esc.y1, env.min[c]));
      var hi = Math.max(esc.y0, Math.min(esc.y1, env.max[c]));
      ctx.moveTo(px, esc.py(lo));
      ctx.lineTo(px, esc.py(hi) - 1);        // −1 garante traço visível quando lo = hi
    }
    ctx.stroke();
    ctx.restore();
  }

  function marcasLog(K) {
    var marcas = [];
    for (var k = 0; Math.pow(10, k) <= K; k++) {
      marcas.push({ v: k, rotulo: k === 0 ? '1' : '10' + F.expoente(k) });
    }
    return marcas;
  }

  function marcasY(y0, y1) {
    /* Cinco marcas em passo redondo dentro da faixa: passo bruto arredondado
     * para 1, 2 ou 5 vezes uma potência de dez, que é o que produz rótulo
     * legível em qualquer escala. */
    var bruto = (y1 - y0) / 4;
    if (!(bruto > 0)) return [{ v: y0, rotulo: F.br(y0, 2) }];
    var pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    var norm = bruto / pot;
    var passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pot;
    var casas = Math.max(0, Math.min(6, -Math.floor(Math.log10(passo))));
    var marcas = [];
    var inicio = Math.ceil(y0 / passo) * passo;
    for (var v = inicio; v <= y1 + passo * 1e-9 && marcas.length < 9; v += passo) {
      marcas.push({ v: v, rotulo: F.br(v, casas) });
    }
    return marcas;
  }

  function desenharSomas(cores) {
    var a = global.Plot.ajustar(el.canvasSomas);
    var K = resultado.K;
    var colunas = Math.max(40, Math.round(a.w - MARGEM_SOMAS.esq - MARGEM_SOMAS.dir));
    var env = R.envelope(resultado.somas, 1, K, colunas, 'log');
    var alvoOuLimite = previsto();
    var faixa = faixaCom(env, [alvoOuLimite, serie().soma]);

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_SOMAS,
      x0: 0, x1: Math.log10(K), y0: faixa.y0, y1: faixa.y1
    });

    global.Plot.eixos(a.ctx, esc, cores, {
      marcasX: marcasLog(K),
      marcasY: marcasY(faixa.y0, faixa.y1)
    });

    // a soma na ordem original, para comparação
    global.Plot.linhaH(a.ctx, esc, serie().soma, {
      cor: cores.referencia, tracejado: [], largura: 1
    });

    desenharEnvelope(a.ctx, esc, env, cores.destaque);

    global.Plot.linhaH(a.ctx, esc, alvoOuLimite, {
      cor: cores.limite, tracejado: [5, 4],
      rotulo: (estado.modo === 'blocos' ? 'limite ' : 'alvo ') + F.br(alvoOuLimite, 4)
    });
  }

  function desenharCauda(cores) {
    var a = global.Plot.ajustar(el.canvasCauda);
    var K = resultado.K;
    var k0 = Math.max(1, Math.round(K * 0.98));
    var colunas = Math.max(40, Math.round(a.w - MARGEM_CAUDA.esq - MARGEM_CAUDA.dir));
    var env = R.envelope(resultado.somas, k0, K, colunas, 'linear');
    var alvoOuLimite = previsto();
    var faixa = faixaCom(env, [alvoOuLimite]);

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: MARGEM_CAUDA,
      x0: k0, x1: K, y0: faixa.y0, y1: faixa.y1
    });

    global.Plot.eixos(a.ctx, esc, cores, {
      marcasX: [{ v: k0, rotulo: F.inteiro(k0) }, { v: K, rotulo: F.inteiro(K) }],
      marcasY: marcasY(faixa.y0, faixa.y1)
    });

    desenharEnvelope(a.ctx, esc, env, cores.destaque);

    global.Plot.linhaH(a.ctx, esc, alvoOuLimite, { cor: cores.limite, tracejado: [5, 4] });
  }

  // =========================================================================
  // Indicadores
  // =========================================================================

  function textoIndicador(elemento, texto, ehTexto) {
    elemento.textContent = texto;
    elemento.className = 'numero' + (ehTexto ? ' texto' : '');
  }

  function atualizarIndicadores() {
    var s = serie();
    var K = resultado.K;
    var alvoOuLimite = previsto();

    el.valorK.textContent = F.inteiro(K);
    el.valorP.textContent = String(estado.p);
    el.valorQ.textContent = String(estado.q);

    textoIndicador(el.indSoma, F.br(resultado.soma, 6), false);
    el.indSomaApoio.textContent = 'com ' + F.inteiro(K) + ' termos';

    el.rotuloPrevisto.textContent = estado.modo === 'blocos' ? 'limite previsto' : 'alvo S';
    textoIndicador(el.indPrevisto, F.br(alvoOuLimite, 6), false);
    el.indPrevistoApoio.textContent = estado.modo === 'blocos'
      ? (s.condicional ? 'ln 2 + ½·ln(p/q)' : 'π²/12, para todo p e q')
      : (resultado.alcancavel ? 'escolhido por você' : 'fora do alcance desta série');

    var dif = Math.abs(resultado.soma - alvoOuLimite);
    textoIndicador(el.indDiferenca, F.numero(dif, { casas: 6, baixo: 1e-4 }), false);

    if (resultado.proporcao === null) {
      textoIndicador(el.indProporcao, 'só positivos', true);
      el.indProporcaoApoio.textContent = 'nenhum negativo foi usado';
    } else {
      textoIndicador(el.indProporcao, F.numero(resultado.proporcao, { casas: 3, alto: 1e4 }), false);
      if (estado.modo === 'blocos') {
        el.indProporcaoApoio.textContent = 'pedido: ' + estado.p + ':' + estado.q +
          ' = ' + F.br(estado.p / estado.q, 3);
      } else if (s.previsaoProporcao(estado.alvo) !== null) {
        /* A formula em si esta no texto da pagina; aqui vai so o numero, para o
         * indicador nao virar LaTeX cru na tela. */
        el.indProporcaoApoio.textContent = 'previsto pela fórmula: ' +
          F.numero(s.previsaoProporcao(estado.alvo), { casas: 3, alto: 1e4 });
      } else {
        el.indProporcaoApoio.textContent = 'série absoluta: sem previsão';
      }
    }

    // ---- cabeça do painel
    el.tituloSomas.textContent = s.nome + ' — ' + (estado.modo === 'blocos'
      ? 'blocos ' + estado.p + ':' + estado.q
      : 'alvo S = ' + F.br(estado.alvo, 2));

    if (resultado.travou) {
      el.marcadorSomas.textContent = 'rearranjo travado';
      el.marcadorSomas.className = 'marcador nao-satisfaz';
    } else if (s.condicional) {
      el.marcadorSomas.textContent = 'convergência condicional';
      el.marcadorSomas.className = 'marcador satisfaz';
    } else {
      el.marcadorSomas.textContent = 'convergência absoluta';
      el.marcadorSomas.className = 'marcador';
    }

    // ---- aviso
    el.avisoTravou.hidden = !resultado.travou;
    if (resultado.travou) {
      if (!resultado.alcancavel) {
        el.avisoTravouTitulo.textContent = 'O alvo é inalcançável.';
        el.avisoTravouTexto.textContent =
          'Todos os termos positivos desta série somam ' + F.br(s.somaPositivos, 6) +
          ', e todos os negativos somam ' + F.br(s.somaNegativos, 6) + '. Nenhuma ordem de ' +
          'soma passa desses limites, porque a série converge absolutamente. O algoritmo ' +
          'empilha positivos para sempre e para no que consegue.';
      } else {
        el.avisoTravouTitulo.textContent = 'O rearranjo travou.';
        el.avisoTravouTexto.textContent =
          'Em todo o último quarto dos termos, uma das duas listas não avançou nenhuma vez: ' +
          'o que resta dela já não é suficiente para levar a soma de volta ao outro lado do ' +
          'alvo. É o que Dirichlet garante que aconteça numa série absolutamente convergente ' +
          '— e o que nunca acontece numa condicionalmente convergente, por mais distante que ' +
          'seja o alvo.';
      }
    }
  }

  function atualizarVisibilidade() {
    el.controlesAlvo.hidden = estado.modo !== 'alvo';
    el.controlesBlocos.hidden = estado.modo !== 'blocos';
  }

  // =========================================================================
  // Ciclo
  // =========================================================================

  function desenhar() {
    recalcular();
    var cores = global.Plot.cores(document.body);
    desenharSomas(cores);
    desenharCauda(cores);
    atualizarIndicadores();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  // =========================================================================
  // Início
  // =========================================================================

  function montarBotoesSerie() {
    el.seletorSerie.textContent = '';
    el.botoesSerie = [];
    R.SERIES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = s.nome;
      b.setAttribute('aria-pressed', s.id === estado.serieId ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado.serieId = s.id;
        el.botoesSerie.forEach(function (outro) {
          outro.setAttribute('aria-pressed', outro === b ? 'true' : 'false');
        });
        agendar();
      });
      el.seletorSerie.appendChild(b);
      el.botoesSerie.push(b);
    });
  }

  function montarAtalhosAlvo() {
    el.atalhosAlvo.textContent = '';
    ALVOS_PRONTOS.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = a.rotulo;
      b.addEventListener('click', function () {
        estado.alvo = a.valor;
        el.campoAlvo.value = String(Number(a.valor.toFixed(4)));
        agendar();
      });
      el.atalhosAlvo.appendChild(b);
    });
  }

  function ligarBotoesModo() {
    el.botoesModo = [];
    var lista = el.seletorModo.querySelectorAll('button[data-modo]');
    for (var i = 0; i < lista.length; i++) {
      (function (b) {
        el.botoesModo.push(b);
        b.addEventListener('click', function () {
          estado.modo = b.getAttribute('data-modo');
          el.botoesModo.forEach(function (outro) {
            outro.setAttribute('aria-pressed', outro === b ? 'true' : 'false');
          });
          atualizarVisibilidade();
          agendar();
        });
      })(lista[i]);
    }
  }

  function lerAlvo() {
    var v = parseFloat(el.campoAlvo.value);
    /* Campo vazio ou no meio de uma digitação como "−" não é erro do usuário:
     * mantém o alvo anterior em vez de saltar para zero e redesenhar tudo. */
    if (!isFinite(v)) return;
    estado.alvo = Math.max(-12, Math.min(12, v));
  }

  function iniciar() {
    el.seletorSerie = document.getElementById('seletor-serie');
    el.seletorModo = document.getElementById('seletor-modo');
    el.controlesAlvo = document.getElementById('controles-alvo');
    el.controlesBlocos = document.getElementById('controles-blocos');
    el.campoAlvo = document.getElementById('campo-alvo');
    el.atalhosAlvo = document.getElementById('atalhos-alvo');
    el.sliderP = document.getElementById('slider-p');
    el.valorP = document.getElementById('valor-p');
    el.sliderQ = document.getElementById('slider-q');
    el.valorQ = document.getElementById('valor-q');
    el.sliderK = document.getElementById('slider-k');
    el.valorK = document.getElementById('valor-k');
    el.botaoReset = document.getElementById('botao-reset');
    el.canvasSomas = document.getElementById('canvas-somas');
    el.canvasCauda = document.getElementById('canvas-cauda');
    el.tituloSomas = document.getElementById('titulo-somas');
    el.marcadorSomas = document.getElementById('marcador-somas');
    el.indSoma = document.getElementById('ind-soma');
    el.indSomaApoio = document.getElementById('ind-soma-apoio');
    el.rotuloPrevisto = document.getElementById('rotulo-previsto');
    el.indPrevisto = document.getElementById('ind-previsto');
    el.indPrevistoApoio = document.getElementById('ind-previsto-apoio');
    el.indDiferenca = document.getElementById('ind-diferenca');
    el.indProporcao = document.getElementById('ind-proporcao');
    el.indProporcaoApoio = document.getElementById('ind-proporcao-apoio');
    el.avisoTravou = document.getElementById('aviso-travou');
    el.avisoTravouTitulo = document.getElementById('aviso-travou-titulo');
    el.avisoTravouTexto = document.getElementById('aviso-travou-texto');

    montarBotoesSerie();
    montarAtalhosAlvo();
    ligarBotoesModo();
    atualizarVisibilidade();
    global.Formulas.renderizar();

    el.campoAlvo.addEventListener('input', function () { lerAlvo(); agendar(); });

    el.sliderP.addEventListener('input', function () {
      var v = parseInt(el.sliderP.value, 10);
      estado.p = (isFinite(v) && v >= 1) ? v : 1;
      agendar();
    });
    el.sliderQ.addEventListener('input', function () {
      var v = parseInt(el.sliderQ.value, 10);
      estado.q = (isFinite(v) && v >= 1) ? v : 1;
      agendar();
    });
    el.sliderK.addEventListener('input', function () {
      var v = parseInt(el.sliderK.value, 10);
      estado.sK = isFinite(v) ? v : PADRAO.sK;
      agendar();
    });

    el.botaoReset.addEventListener('click', function () {
      estado.serieId = PADRAO.serieId;
      estado.modo = PADRAO.modo;
      estado.alvo = PADRAO.alvo;
      estado.p = PADRAO.p;
      estado.q = PADRAO.q;
      estado.sK = PADRAO.sK;
      el.campoAlvo.value = String(PADRAO.alvo);
      el.sliderP.value = String(PADRAO.p);
      el.sliderQ.value = String(PADRAO.q);
      el.sliderK.value = String(PADRAO.sK);
      el.botoesSerie.forEach(function (b, i) {
        b.setAttribute('aria-pressed', R.SERIES[i].id === PADRAO.serieId ? 'true' : 'false');
      });
      el.botoesModo.forEach(function (b) {
        b.setAttribute('aria-pressed',
                       b.getAttribute('data-modo') === PADRAO.modo ? 'true' : 'false');
      });
      atualizarVisibilidade();
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
