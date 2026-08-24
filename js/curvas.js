/* curvas.js — as seis parametrizações e a reparametrização por comprimento de arco.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Curvas (script clássico, ver fourier.js).
 *
 * Todas as curvas são fechadas e parametrizadas em s ∈ [0, 2π].
 */
(function (global) {
  'use strict';

  var TAU = 2 * Math.PI;

  var PADRAO = {
    N: 512,
    densidade: 6000,   // pontos da grade uniforme inicial
    arco: true,
    limiar: 4096,      // nenhuma corda da malha densa passa de comprimento/limiar
    maxPontos: 262144,
    maxPassos: 60
  };

  function sgn(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }

  /* Cosseno e seno com redução exata de quadrante.
   *
   * Math.sin(2π) devolve −2,4e−16 em vez de 0. Isso é inofensivo num círculo,
   * mas a superelipse de Fermat n=10 eleva esse resíduo a 1/5 e o transforma em
   * 7,5e−4 — a curva deixaria de fechar de forma visível. Reduzindo s ao
   * primeiro quadrante, os zeros nos múltiplos de π/2 saem exatos.
   * O "+ 0" no fim existe para nunca devolver −0.
   */
  function cosSin(s) {
    var u = s / TAU;
    u -= Math.floor(u);
    if (!(u >= 0 && u < 1)) u = 0;
    var q = Math.floor(4 * u);
    if (q > 3) q = 3;
    var th = (u - q * 0.25) * TAU;
    var c = Math.cos(th), d = Math.sin(th);
    switch (q) {
      case 0: return [c + 0, d + 0];
      case 1: return [-d + 0, c + 0];
      case 2: return [-c + 0, -d + 0];
      default: return [d + 0, -c + 0];
    }
  }

  /* Superelipse de Fermat |x|^n + |y|^n = 1, com expoente 2/n na parametrização. */
  function superelipse(n) {
    var e = 2 / n;
    return function (s) {
      var t = cosSin(s), c = t[0], d = t[1];
      return [sgn(c) * Math.pow(Math.abs(c), e), sgn(d) * Math.pow(Math.abs(d), e)];
    };
  }

  var CURVAS = [
    {
      id: 'circulo',
      previsto: { modelo: 'finito', rotulo: 'espectro finito',
                   razao: 'z(s) = e^{is}: um único termo, nada a decair' },
      nome: 'Círculo',
      singularidade: 'nenhuma; espectro finito',
      param: function (s) { return cosSin(s); }
    },
    {
      id: 'fermat4',
      previsto: { modelo: 'exponencial', rotulo: 'exponencial',
                   razao: 'curva analítica — decai mais rápido que qualquer potência' },
      nome: 'Fermat n=4',
      singularidade: 'lisa, mas quase quadrada',
      param: superelipse(4)
    },
    {
      id: 'fermat10',
      previsto: { modelo: 'exponencial', rotulo: 'exponencial',
                   razao: 'analítica, mas quase quadrada: a taxa é lenta e a faixa curta' },
      nome: 'Fermat n=10',
      singularidade: 'quatro quinas incipientes',
      param: superelipse(10)
    },
    {
      id: 'lemniscata',
      previsto: { modelo: 'exponencial', rotulo: 'exponencial',
                   razao: 'analítica: a auto-interseção não é singularidade da curva' },
      nome: 'Lemniscata de Bernoulli',
      singularidade: 'lisa (auto-interseção, sem quina)',
      param: function (s) {
        var t = cosSin(s), c = t[0], d = t[1];
        var den = 1 + d * d;
        return [c / den, d * c / den];
      }
    },
    {
      id: 'cubica-nodal',
      previsto: { modelo: 'potencia', expoente: -2, rotulo: 'n⁻²',
                   razao: 'no nó as duas tangentes diferem: bico em arco' },
      nome: 'Cúbica nodal',
      singularidade: 'nó: vértice angular na origem',
      param: function (s) {
        var t = -1 + s / Math.PI;
        var u = t * t - 1;
        return [u, t * u];
      }
    },
    {
      id: 'astroide',
      previsto: { modelo: 'potencia', expoente: -2, rotulo: 'n⁻²',
                   razao: 'a cúspide inverte a tangente: em arco, x ≈ 1 − |σ|' },
      nome: 'Astroide',
      singularidade: 'quatro cúspides',
      param: function (s) {
        var t = cosSin(s), c = t[0], d = t[1];
        return [c * c * c, d * d * d];
      }
    }
  ];

  function porId(id) {
    for (var i = 0; i < CURVAS.length; i++) if (CURVAS[i].id === id) return CURVAS[i];
    return null;
  }

  function resolver(curva) {
    if (typeof curva === 'string') {
      var c = porId(curva);
      if (!c) throw new Error('curva desconhecida: ' + curva);
      return c;
    }
    if (!curva || typeof curva.param !== 'function') throw new Error('curva inválida.');
    return curva;
  }

  /* Amostragem densa em s ∈ [0, 2π] com refinamento adaptativo, mais o
   * comprimento de arco poligonal acumulado. O último ponto fecha no primeiro.
   *
   * Por que adaptativo: a superelipse de Fermat tem velocidade INFINITA nos
   * quatro pontos sobre os eixos (para n = 10, |dz/ds| ~ 0,2·|s|^{-0,8}). Numa
   * grade uniforme de 6000 pontos, a primeira corda sozinha carrega 3% do
   * comprimento da curva — a tabela de comprimento de arco sai errada e, com
   * ela, todo o expoente de decaimento medido. Nenhuma grade uniforme resolve
   * isso (seriam precisos ~1e10 pontos); bissetar as cordas longas resolve com
   * algumas centenas de pontos extras.
   *
   * Dois sinalizadores distinguem por que o refinamento parou, porque as causas
   * pedem reações opostas:
   *   saturou        — acabou o orçamento (maxPontos / maxPassos). É defeito de
   *                    configuração: aumente o orçamento.
   *   limitePrecisao — não existe parâmetro representável entre os extremos do
   *                    segmento. É o piso da precisão dupla, e nada aumenta.
   *                    Acontece nos pontos de velocidade infinita das
   *                    superelipses e não invalida a tabela.
   *
   * Devolve { pontos, s, x, y, acum, total, saturou, limitePrecisao }.
   */
  function amostrarDenso(curva, m, opcoes) {
    var c = resolver(curva);
    var mm = m || PADRAO.densidade;
    var o = opcoes || {};
    var limiar = o.limiar === undefined ? PADRAO.limiar : o.limiar;
    var maxPontos = o.maxPontos === undefined ? PADRAO.maxPontos : o.maxPontos;
    var maxPassos = o.maxPassos === undefined ? PADRAO.maxPassos : o.maxPassos;

    var s = [], x = [], y = [], i, p;
    for (i = 0; i <= mm; i++) {
      var si = TAU * i / mm;
      p = c.param(si);
      s.push(si); x.push(p[0]); y.push(p[1]);
    }

    var saturou = false, limitePrecisao = false;
    for (var passo = 0; passo < maxPassos; passo++) {
      var total = 0;
      for (i = 1; i < s.length; i++) total += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
      var alvo = total / limiar;
      if (!(alvo > 0)) break;

      var ns = [s[0]], nx = [x[0]], ny = [y[0]];
      var bisectou = false, restam = false;
      for (i = 1; i < s.length; i++) {
        var d = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
        if (d > alvo) {
          var sm = 0.5 * (s[i - 1] + s[i]);
          if (ns.length + (s.length - i) >= maxPontos) {
            saturou = true;                      // estourou o orçamento de pontos
          } else if (sm > s[i - 1] && sm < s[i]) {
            p = c.param(sm);
            ns.push(sm); nx.push(p[0]); ny.push(p[1]);
            bisectou = true;
            restam = true;
          } else {
            limitePrecisao = true;               // ulp: não há parâmetro no meio
          }
        }
        ns.push(s[i]); nx.push(x[i]); ny.push(y[i]);
      }
      s = ns; x = nx; y = ny;
      if (!bisectou) break;
      if (passo === maxPassos - 1 && restam) saturou = true;
    }

    var n = s.length;
    var fs = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n);
    var acum = new Float64Array(n);
    for (i = 0; i < n; i++) {
      fs[i] = s[i]; fx[i] = x[i]; fy[i] = y[i];
      if (i > 0) acum[i] = acum[i - 1] + Math.hypot(fx[i] - fx[i - 1], fy[i] - fy[i - 1]);
    }
    return { pontos: n, s: fs, x: fx, y: fy, acum: acum, total: acum[n - 1],
             saturou: saturou, limitePrecisao: limitePrecisao };
  }

  /* Comprimento de arco acumulado até o parâmetro s, por interpolação linear
   * na tabela densa (busca binária, já que a malha é não uniforme).
   */
  function comprimentoAte(tabela, s) {
    var n = tabela.pontos;
    if (s <= tabela.s[0]) return 0;
    if (s >= tabela.s[n - 1]) return tabela.total;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (tabela.s[mid] <= s) lo = mid; else hi = mid;
    }
    var seg = tabela.s[hi] - tabela.s[lo];
    var u = seg > 0 ? (s - tabela.s[lo]) / seg : 0;
    return tabela.acum[lo] + u * (tabela.acum[hi] - tabela.acum[lo]);
  }

  /* Reparametrização por comprimento de arco.
   *
   * Detalhe importante: invertemos σ ↦ s na tabela densa e reavaliamos a
   * PARAMETRIZAÇÃO EXATA em s, em vez de interpolar entre os pontos densos.
   * Os pontos resultantes ficam exatamente sobre a curva (o erro O(h²) fica só
   * na estimativa do comprimento, deslocando o ponto ao longo da curva). Sem
   * isso, o círculo com N = 512 já apresentaria coeficientes espúrios da ordem
   * de 1e-7, vindos do polígono e não da geometria.
   *
   * Devolve { s, x, y, total } com N pontos (sem repetir o fechamento).
   */
  function reamostrarPorArco(curva, N, densidade, opcoes) {
    var c = resolver(curva);
    var tab = amostrarDenso(c, densidade, opcoes);
    var total = tab.total;
    if (!(total > 0)) throw new Error('curva degenerada: comprimento nulo.');

    var s = new Float64Array(N);
    var x = new Float64Array(N);
    var y = new Float64Array(N);
    var i = 0;
    for (var k = 0; k < N; k++) {
      var alvo = total * k / N;
      while (i < tab.pontos - 2 && tab.acum[i + 1] < alvo) i++;
      var seg = tab.acum[i + 1] - tab.acum[i];
      var u = seg > 0 ? (alvo - tab.acum[i]) / seg : 0;   // cúspide: velocidade nula
      var sk = tab.s[i] + u * (tab.s[i + 1] - tab.s[i]);
      var p = c.param(sk);
      s[k] = sk; x[k] = p[0]; y[k] = p[1];
    }
    return { s: s, x: x, y: y, total: total, tabela: tab };
  }

  /* Amostragem uniforme no PARÂMETRO (checkbox de arco desligado). */
  function reamostrarPorParametro(curva, N) {
    var c = resolver(curva);
    var s = new Float64Array(N);
    var x = new Float64Array(N);
    var y = new Float64Array(N);
    for (var k = 0; k < N; k++) {
      var sk = TAU * k / N;
      var p = c.param(sk);
      s[k] = sk; x[k] = p[0]; y[k] = p[1];
    }
    var total = 0;
    for (k = 0; k < N; k++) {
      var j = (k + 1) % N;
      total += Math.hypot(x[j] - x[k], y[j] - y[k]);
    }
    return { s: s, x: x, y: y, total: total };
  }

  /* Ponto de entrada dos módulos: devolve as N amostras prontas para a DFT.
   * opcoes: { N, arco, densidade }.
   * Devolve { re, im, s, total, arco, N }, com z_k = re[k] + i·im[k].
   */
  function amostrar(curva, opcoes) {
    var o = opcoes || {};
    var N = o.N === undefined ? PADRAO.N : o.N;
    var arco = o.arco === undefined ? PADRAO.arco : !!o.arco;
    var densidade = o.densidade === undefined ? PADRAO.densidade : o.densidade;

    var r = arco ? reamostrarPorArco(curva, N, densidade, o)
                 : reamostrarPorParametro(curva, N);
    return { N: N, arco: arco, re: r.x, im: r.y, s: r.s, total: r.total };
  }

  /* Distâncias entre pontos consecutivos (fechando o laço). */
  function espacamentos(x, y) {
    var N = x.length;
    var d = new Float64Array(N);
    for (var k = 0; k < N; k++) {
      var j = (k + 1) % N;
      d[k] = Math.hypot(x[j] - x[k], y[j] - y[k]);
    }
    return d;
  }

  global.Curvas = {
    TAU: TAU,
    PADRAO: PADRAO,
    CURVAS: CURVAS,
    porId: porId,
    cosSin: cosSin,
    superelipse: superelipse,
    amostrarDenso: amostrarDenso,
    comprimentoAte: comprimentoAte,
    reamostrarPorArco: reamostrarPorArco,
    reamostrarPorParametro: reamostrarPorParametro,
    amostrar: amostrar,
    espacamentos: espacamentos
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
