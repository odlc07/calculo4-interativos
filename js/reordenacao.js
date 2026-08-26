/* reordenacao.js — rearranjos de séries alternadas.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Reordenacao (script clássico, ver fourier.js).
 *
 * Uma série alternada é lida aqui como duas listas: a dos termos positivos e a
 * dos negativos. Reordenar é escolher em que ritmo consumir cada lista, e o
 * comportamento depende inteiramente de quanto cada uma das duas soma.
 *
 *   CONDICIONALMENTE CONVERGENTE  Σ|a_k| = ∞, com Σ positivos = +∞ e
 *     Σ negativos = −∞. Como cada lista sozinha vai a infinito, dá para
 *     ultrapassar qualquer alvo e voltar quantas vezes se queira; como a_k → 0,
 *     as ultrapassagens ficam cada vez menores. É o teorema do rearranjo de
 *     Riemann: existe rearranjo convergindo para qualquer número real dado.
 *
 *   ABSOLUTAMENTE CONVERGENTE  as duas listas somam valores finitos. Nenhuma
 *     delas leva a soma para longe, e todo rearranjo converge para o mesmo
 *     valor (Dirichlet). Aqui é o contraste, não o fenômeno.
 *
 * Duas maneiras de reordenar estão implementadas:
 *
 *   guloso(alvo)  enquanto a soma está ≤ alvo, toma o próximo positivo; senão,
 *                 o próximo negativo. É a construção da demonstração.
 *
 *   blocos(p, q)  p positivos, q negativos, repetindo. Para a harmônica
 *                 alternada o limite é exatamente ln 2 + ½·ln(p/q), e é essa
 *                 forma fechada que transforma o rearranjo de curiosidade em
 *                 previsão conferível.
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var LN2 = Math.LN2;
  var PI2_8 = PI * PI / 8;      // Σ 1/(2i−1)²
  var PI2_24 = PI * PI / 24;    // Σ 1/(2j)²
  var PI2_12 = PI * PI / 12;    // Σ (−1)^{k+1}/k²

  var K_MAX = 200000;

  // =========================================================================
  // As séries
  // =========================================================================

  var SERIES = [
    {
      id: 'harmonica',
      nome: 'Harmônica alternada',
      classe: 'condicional',
      condicional: true,
      latex: '\\sum_{k\\ge1}\\frac{(-1)^{k+1}}{k}',
      limite: '\\ln 2',
      soma: LN2,
      positivo: function (i) { return 1 / (2 * i + 1); },       // 1, 1/3, 1/5, …
      negativo: function (j) { return -1 / (2 * j + 2); },      // −1/2, −1/4, …
      somaPositivos: Infinity,
      somaNegativos: -Infinity,

      /* Limite do rearranjo p:q. Vale porque a soma de p·m termos positivos é
       * ½·ln(pm) + (γ + ln2)/2 + o(1) e a de q·m negativos é −½·ln(qm) − γ/2 +
       * o(1); o que sobra é ln2 + ½·ln(p/q). */
      previsaoRazao: function (p, q) { return LN2 + 0.5 * Math.log(p / q); },
      previsaoRazaoLatex: '\\ln 2+\\tfrac12\\ln(p/q)',

      /* Proporção positivos:negativos que o algoritmo guloso acaba usando para
       * chegar ao alvo S. É a fórmula acima invertida: se o rearranjo tende a
       * S, a razão p/q com que ele consome as listas tem de ser e^{2(S−ln2)}.
       * O guloso não sabe disso — ele só compara com o alvo a cada passo —, e
       * mesmo assim a proporção medida cai em cima da prevista. */
      previsaoProporcao: function (alvo) { return Math.exp(2 * (alvo - LN2)); },
      previsaoProporcaoLatex: 'e^{2(S-\\ln 2)}'
    },
    {
      id: 'quadrados',
      nome: 'Alternada dos quadrados',
      classe: 'absoluta',
      condicional: false,
      latex: '\\sum_{k\\ge1}\\frac{(-1)^{k+1}}{k^{2}}',
      limite: '\\frac{\\pi^{2}}{12}',
      soma: PI2_12,
      positivo: function (i) { var k = 2 * i + 1; return 1 / (k * k); },
      negativo: function (j) { var k = 2 * j + 2; return -1 / (k * k); },
      somaPositivos: PI2_8,
      somaNegativos: -PI2_24,

      /* Dirichlet: absolutamente convergente, todo rearranjo dá o mesmo. p e q
       * não movem o limite, e é exatamente isso que se vê ao arrastá-los. */
      previsaoRazao: function () { return PI2_12; },
      previsaoRazaoLatex: '\\frac{\\pi^{2}}{12}\\ \\text{(não depende de }p,q)',

      previsaoProporcao: function () { return null; },
      previsaoProporcaoLatex: null
    }
  ];

  function porId(id) {
    for (var i = 0; i < SERIES.length; i++) {
      if (SERIES[i].id === id) return SERIES[i];
    }
    return null;
  }

  /* Um alvo só é alcançável se as duas listas conseguirem levar a soma até ele.
   * Numa série condicionalmente convergente isso é todo número real; numa
   * absolutamente convergente, quase nenhum. */
  function alcancavel(serie, alvo) {
    return alvo <= serie.somaPositivos && alvo >= serie.somaNegativos;
  }

  function limitarK(K) {
    var k = Math.round(K);
    if (!(k >= 1)) return 1;
    return Math.min(k, K_MAX);
  }

  // =========================================================================
  // Os dois rearranjos
  // =========================================================================

  /* Resultado comum aos dois: as K somas parciais, quantos termos de cada lista
   * foram consumidos, e se o processo travou.
   *
   * `travou` é medido, não deduzido: se em todo o último quarto dos termos uma
   * das duas listas não avançou nenhuma vez, o rearranjo deixou de alternar e
   * virou uma soma de uma lista só. É o que acontece com toda série
   * absolutamente convergente, e nunca com uma condicionalmente convergente. */
  function finalizar(somas, ip, iq, ipQuarto, iqQuarto) {
    var travou = (ip - ipQuarto === 0) || (iq - iqQuarto === 0);
    return {
      somas: somas,
      K: somas.length,
      soma: somas[somas.length - 1],
      positivos: ip,
      negativos: iq,
      proporcao: iq > 0 ? ip / iq : null,
      travou: travou
    };
  }

  /* Rearranjo guloso mirando um alvo. */
  function guloso(serie, alvo, K) {
    var n = limitarK(K);
    var somas = new Float64Array(n);
    var s = 0, ip = 0, iq = 0;
    var corte = Math.floor(n * 0.75);
    var ipQuarto = 0, iqQuarto = 0;
    for (var k = 0; k < n; k++) {
      if (k === corte) { ipQuarto = ip; iqQuarto = iq; }
      if (s <= alvo) { s += serie.positivo(ip); ip++; }
      else { s += serie.negativo(iq); iq++; }
      somas[k] = s;
    }
    var r = finalizar(somas, ip, iq, ipQuarto, iqQuarto);
    r.alvo = alvo;
    r.alcancavel = alcancavel(serie, alvo);
    r.erro = Math.abs(r.soma - alvo);
    return r;
  }

  /* Rearranjo em blocos de p positivos e q negativos. */
  function blocos(serie, p, q, K) {
    var n = limitarK(K);
    var pp = Math.max(1, Math.round(p));
    var qq = Math.max(1, Math.round(q));
    var somas = new Float64Array(n);
    var s = 0, ip = 0, iq = 0, k = 0;
    var corte = Math.floor(n * 0.75);
    var ipQuarto = 0, iqQuarto = 0;
    var posicao = 0;                       // posição dentro do bloco de p + q
    while (k < n) {
      if (k === corte) { ipQuarto = ip; iqQuarto = iq; }
      if (posicao < pp) { s += serie.positivo(ip); ip++; }
      else { s += serie.negativo(iq); iq++; }
      posicao++;
      if (posicao === pp + qq) posicao = 0;
      somas[k] = s;
      k++;
    }
    var r = finalizar(somas, ip, iq, ipQuarto, iqQuarto);
    r.p = pp;
    r.q = qq;
    r.previsto = serie.previsaoRazao(pp, qq);
    r.erro = Math.abs(r.soma - r.previsto);
    return r;
  }

  // =========================================================================
  // Envelope para desenho
  // =========================================================================

  /* As somas parciais oscilam de um termo para o outro, e é justamente a
   * oscilação que conta a história. Subamostrar uma a cada cem apagaria isso e
   * desenharia uma curva lisa que não existe. Em vez disso, cada coluna de
   * pixel recebe o mínimo e o máximo das somas que caem nela: o traço fica com
   * a espessura real da serpentina.
   *
   * `escala` é 'log' ou 'linear'. Em log o eixo é log10(k), com k a partir de 1
   * — o que permite ver ao mesmo tempo os primeiros passos e a cauda.
   *
   * A densidade de amostras por coluna varia MUITO em escala log: com 20 mil
   * termos em 700 colunas, as primeiras 300 recebem zero ou uma amostra e as
   * últimas recebem cinquenta cada. Nas colunas ralas o mínimo e o máximo
   * coincidem, e uma barra vertical de altura zero por coluna não desenha
   * curva nenhuma: desenha tracinhos soltos. Por isso saem daqui também o
   * `primeiro` e o `ultimo` valor de cada coluna — é com eles que quem desenha
   * liga uma coluna à seguinte, e o traço vira poligonal onde há uma amostra
   * por coluna e faixa onde há muitas, sem trocar de representação no meio.
   *
   * Colunas sem amostra alguma ficam marcadas como vazias e não são
   * preenchidas com o valor da vizinha: quem desenha passa por cima delas, que
   * é o que a poligonal faz de qualquer forma.
   */
  function envelope(somas, k0, k1, colunas, escala) {
    var nCol = Math.max(1, Math.round(colunas));
    var ini = Math.max(1, Math.round(k0));
    var fim = Math.min(somas.length, Math.round(k1));
    var min = new Float64Array(nCol);
    var max = new Float64Array(nCol);
    var primeiro = new Float64Array(nCol);
    var ultimo = new Float64Array(nCol);
    var conta = new Int32Array(nCol);
    var vazio = new Uint8Array(nCol);
    var c;
    for (c = 0; c < nCol; c++) { min[c] = Infinity; max[c] = -Infinity; vazio[c] = 1; }

    var log = escala === 'log';
    var a = log ? Math.log(ini) : ini;
    var b = log ? Math.log(fim) : fim;
    var largura = (b - a) || 1;

    for (var k = ini; k <= fim; k++) {
      var pos = ((log ? Math.log(k) : k) - a) / largura;
      c = Math.floor(pos * (nCol - 1) + 0.5);
      if (c < 0) c = 0;
      if (c >= nCol) c = nCol - 1;
      var v = somas[k - 1];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
      if (vazio[c]) { primeiro[c] = v; vazio[c] = 0; }
      ultimo[c] = v;
      conta[c]++;
    }

    return { min: min, max: max, primeiro: primeiro, ultimo: ultimo,
             conta: conta, vazio: vazio, colunas: nCol,
             k0: ini, k1: fim, escala: escala };
  }

  /* Faixa vertical que contém o envelope, com folga. Devolve null se não houver
   * nenhuma coluna preenchida. */
  function faixa(env, folga) {
    var lo = Infinity, hi = -Infinity;
    for (var c = 0; c < env.colunas; c++) {
      if (env.vazio[c]) continue;
      if (env.min[c] < lo) lo = env.min[c];
      if (env.max[c] > hi) hi = env.max[c];
    }
    if (!isFinite(lo) || !isFinite(hi)) return null;
    var f = (folga === undefined ? 0.08 : folga) * ((hi - lo) || 1);
    return { y0: lo - f, y1: hi + f };
  }

  global.Reordenacao = {
    K_MAX: K_MAX,
    LN2: LN2,
    PI2_8: PI2_8,
    PI2_24: PI2_24,
    PI2_12: PI2_12,
    SERIES: SERIES,
    porId: porId,
    alcancavel: alcancavel,
    guloso: guloso,
    blocos: blocos,
    envelope: envelope,
    faixa: faixa
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
