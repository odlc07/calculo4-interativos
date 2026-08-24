/* iteracao.js — sequências recursivas, pontos fixos e diagrama de teia.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Iteracao (script clássico, ver fourier.js).
 *
 * Dada g e um valor inicial a₀, a sequência é a_{n+1} = g(a_n). O diagrama de
 * teia desenha y = g(x) e a reta y = x, e alterna:
 *   1. de (a_n, a_n) sobe ou desce VERTICALMENTE até (a_n, g(a_n));
 *   2. de lá vai HORIZONTALMENTE até (a_{n+1}, a_{n+1}) sobre a diagonal.
 *
 * Pontos fixos são as interseções de y = g(x) com y = x. A classificação local
 * sai de |g'(p)|: menor que 1 é atrator, maior é repulsor, e igual a 1 é
 * INCONCLUSIVO pelo critério de primeira ordem — caso em que este módulo diz
 * "inconclusivo" em vez de chutar.
 *
 * As derivadas são analíticas de propósito: diferença finita introduz ruído
 * justamente onde |g'| ≈ 1, que é onde a classificação decide.
 */
(function (global) {
  'use strict';

  var LIMITE_ESCAPE = 1e6;

  // =========================================================================
  // As funções
  // =========================================================================

  var FUNCOES = [
    {
      id: 'raiz6',
      rotulo: '√(6+x)',
      latex: 'g(x)=\\sqrt{6+x}',
      g: function (x) { return Math.sqrt(6 + x); },
      dg: function (x) { return 1 / (2 * Math.sqrt(6 + x)); },
      dominio: { min: -6, max: Infinity, abertoMin: true },
      janela: { x0: -6.5, x1: 8, y0: -3, y1: 8 },
      a0: 0,
      /* A equação g(x) = x elevada ao quadrado vira x² − x − 6 = 0, de raízes
       * 3 e −2. Só 3 é ponto fixo: a raiz quadrada é não negativa, então
       * g(−2) = √4 = 2 ≠ −2. O −2 é raiz espúria, introduzida ao elevar ao
       * quadrado — e é exatamente o distrator tentador da questão. */
      algebrica: {
        equacao: 'x^{2}-x-6=0',
        raizes: [3, -2],
        espurias: [-2],
        explicacao: 'Elevar g(x) = x ao quadrado introduz −2, que não é ponto ' +
                    'fixo: √4 = 2, e não −2. A raiz quadrada é não negativa.'
      }
    },
    {
      id: 'cos',
      rotulo: 'cos x',
      latex: 'g(x)=\\cos x',
      g: function (x) { return Math.cos(x); },
      dg: function (x) { return -Math.sin(x); },
      dominio: { min: -Infinity, max: Infinity },
      janela: { x0: -1.6, x1: 1.6, y0: -1.2, y1: 1.4 },
      a0: 1.2,
      nota: 'Ponto fixo é o número de Dottie. Como g′ é negativa, a órbita ' +
            'converge oscilando em volta dele.'
    },
    {
      id: 'quadrado',
      rotulo: 'x²',
      latex: 'g(x)=x^{2}',
      g: function (x) { return x * x; },
      dg: function (x) { return 2 * x; },
      dominio: { min: -Infinity, max: Infinity },
      janela: { x0: -0.4, x1: 1.6, y0: -0.4, y1: 1.6 },
      a0: 0.8,
      nota: 'Dois pontos fixos com destinos opostos: 0 atrai, 1 repele. ' +
            'Aqui o valor inicial decide, e o módulo mostra por quê.'
    },
    {
      id: 'logistica32',
      rotulo: 'logística r=3,2',
      latex: 'g(x)=3{,}2\\,x(1-x)',
      g: function (x) { return 3.2 * x * (1 - x); },
      dg: function (x) { return 3.2 * (1 - 2 * x); },
      dominio: { min: 0, max: 1 },
      janela: { x0: 0, x1: 1, y0: 0, y1: 1 },
      a0: 0.2,
      nota: 'O ponto fixo é repulsor e a órbita cai num ciclo de período 2: ' +
            'a teia fecha num retângulo em vez de espiralar para o ponto.'
    },
    {
      id: 'logistica28',
      rotulo: 'logística r=2,8',
      latex: 'g(x)=2{,}8\\,x(1-x)',
      g: function (x) { return 2.8 * x * (1 - x); },
      dg: function (x) { return 2.8 * (1 - 2 * x); },
      dominio: { min: 0, max: 1 },
      janela: { x0: 0, x1: 1, y0: 0, y1: 1 },
      a0: 0.2,
      nota: 'Mesma família, r menor: agora o ponto fixo atrai. O contraste com ' +
            'r = 3,2 isola o papel de |g′(p)|.'
    }
  ];

  function porId(id) {
    for (var i = 0; i < FUNCOES.length; i++) if (FUNCOES[i].id === id) return FUNCOES[i];
    return null;
  }

  // =========================================================================
  // Domínio
  // =========================================================================

  function noDominio(fn, x) {
    if (!isFinite(x)) return false;
    var d = fn.dominio;
    if (d.abertoMin ? x <= d.min : x < d.min) return false;
    if (d.abertoMax ? x >= d.max : x > d.max) return false;
    return true;
  }

  // =========================================================================
  // Pontos fixos
  // =========================================================================

  /* Varre a janela procurando mudanças de sinal em h(x) = g(x) − x e refina
   * cada uma por bissecção. Sem fórmula fechada: assim continua funcionando
   * para qualquer g que alguém acrescente depois. */
  function pontosFixos(fn, opcoes) {
    var o = opcoes || {};
    var jan = o.janela || fn.janela;
    var passos = o.passos || 4000;
    var tol = o.tol === undefined ? 1e-12 : o.tol;

    function h(x) { return fn.g(x) - x; }

    var achados = [];
    var xAnt = null, hAnt = null;
    for (var i = 0; i <= passos; i++) {
      var x = jan.x0 + (jan.x1 - jan.x0) * i / passos;
      if (!noDominio(fn, x)) { xAnt = null; hAnt = null; continue; }
      var hx = h(x);
      if (!isFinite(hx)) { xAnt = null; hAnt = null; continue; }

      if (hx === 0) {
        achados.push(x);
      } else if (hAnt !== null && ((hAnt < 0) !== (hx < 0))) {
        achados.push(bissecao(h, xAnt, x, tol));
      }
      xAnt = x; hAnt = hx;
    }

    // remove duplicatas vindas de varreduras vizinhas
    achados.sort(function (a, b) { return a - b; });
    var unicos = [];
    for (i = 0; i < achados.length; i++) {
      if (!unicos.length || Math.abs(achados[i] - unicos[unicos.length - 1]) > 1e-7) {
        unicos.push(achados[i]);
      }
    }

    return unicos.map(function (p) {
      var d = fn.dg(p);
      return { x: p, dg: d, classe: classificar(d), rotulo: rotuloDaClasse(classificar(d)) };
    });
  }

  function bissecao(h, a, b, tol) {
    var ha = h(a);
    for (var i = 0; i < 200; i++) {
      var m = 0.5 * (a + b);
      var hm = h(m);
      if (hm === 0 || (b - a) < tol) return m;
      if ((ha < 0) !== (hm < 0)) { b = m; } else { a = m; ha = hm; }
    }
    return 0.5 * (a + b);
  }

  /* |g′(p)| = 1 não decide nada em primeira ordem. Dizer "inconclusivo" é a
   * resposta correta, e não um chute para um dos lados. */
  function classificar(d, tol) {
    var t = tol === undefined ? 1e-9 : tol;
    var m = Math.abs(d);
    if (!isFinite(m)) return 'inconclusivo';
    if (m < 1 - t) return 'atrator';
    if (m > 1 + t) return 'repulsor';
    return 'inconclusivo';
  }

  function rotuloDaClasse(c) {
    if (c === 'atrator') return 'atrator';
    if (c === 'repulsor') return 'repulsor';
    return 'inconclusivo';
  }

  // =========================================================================
  // Órbita
  // =========================================================================

  /* Itera a_{n+1} = g(a_n), parando com motivo explícito em vez de propagar
   * NaN: fora do domínio, escapando para o infinito, ou já parada no ponto
   * fixo dentro da tolerância. */
  function orbita(fn, a0, n, opcoes) {
    var o = opcoes || {};
    var tolParada = o.tolParada === undefined ? 1e-14 : o.tolParada;
    var valores = [];
    var parada = 'ok', mensagem = '';

    if (!noDominio(fn, a0)) {
      return { valores: [], parada: 'dominio', mensagem: 'a órbita saiu do domínio de g' };
    }
    valores.push(a0);

    for (var i = 0; i < n; i++) {
      var atual = valores[valores.length - 1];
      var prox = fn.g(atual);

      if (!isFinite(prox)) {
        parada = 'dominio';
        mensagem = 'a órbita saiu do domínio de g';
        break;
      }
      if (Math.abs(prox) > LIMITE_ESCAPE) {
        valores.push(prox);
        parada = 'escape';
        mensagem = 'a órbita diverge: |aₙ| passou de 10⁶';
        break;
      }
      if (!noDominio(fn, prox)) {
        valores.push(prox);
        parada = 'dominio';
        mensagem = 'a órbita saiu do domínio de g';
        break;
      }
      valores.push(prox);
      if (Math.abs(prox - atual) < tolParada) {
        parada = 'fixo';
        mensagem = 'a órbita estacionou no ponto fixo';
        break;
      }
    }
    return { valores: valores, parada: parada, mensagem: mensagem };
  }

  /* Segmentos da teia: vertical até a curva, horizontal até a diagonal.
   * `minimo` descarta segmentos menores que isso — perto do ponto fixo eles
   * viram um borrão sobre o ponto em vez de informação. */
  function segmentosTeia(valores, fn, minimo) {
    var m = minimo === undefined ? 0 : minimo;
    var segs = [];
    for (var i = 0; i + 1 < valores.length; i++) {
      var a = valores[i], b = valores[i + 1];
      if (!isFinite(a) || !isFinite(b)) break;
      if (Math.abs(b - a) < m) break;
      segs.push({ tipo: 'vertical', x0: a, y0: a, x1: a, y1: b, n: i });
      segs.push({ tipo: 'horizontal', x0: a, y0: b, x1: b, y1: b, n: i });
    }
    return segs;
  }

  /* Detecta ciclo de período p ≥ 2 na cauda da órbita — é o que a logística
   * com r = 3,2 precisa mostrar. Devolve o período ou 0. */
  function periodo(valores, tol, maxP) {
    var t = tol === undefined ? 1e-7 : tol;
    var mp = maxP === undefined ? 8 : maxP;
    var n = valores.length;
    if (n < 12) return 0;
    var cauda = valores.slice(Math.max(0, n - 4 * mp));
    for (var p = 1; p <= mp; p++) {
      var bate = true;
      for (var i = 0; i + p < cauda.length; i++) {
        if (Math.abs(cauda[i] - cauda[i + p]) > t) { bate = false; break; }
      }
      if (bate) return p;
    }
    return 0;
  }

  global.Iteracao = {
    FUNCOES: FUNCOES,
    porId: porId,
    noDominio: noDominio,
    pontosFixos: pontosFixos,
    classificar: classificar,
    bissecao: bissecao,
    orbita: orbita,
    segmentosTeia: segmentosTeia,
    periodo: periodo,
    LIMITE_ESCAPE: LIMITE_ESCAPE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
