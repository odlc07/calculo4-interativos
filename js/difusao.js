/* difusao.js — a equação do calor e a equação da onda no círculo, resolvidas
 * por séries de Fourier.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Difusao (script clássico, ver fourier.js).
 *
 * O domínio é o círculo de comprimento 2L com L = π: a condição inicial é
 * 2π-periódica, exatamente como nos módulos 1 e 2, e a notação segue as notas
 * da disciplina. Escrevendo
 *
 *   u(x,t) = Σ_n û(n,t) e^{inπx/L},
 *
 * cada modo separa e vira uma EDO em t:
 *
 *   CALOR   u_t = α u_xx    →  û'(n,t) = −α(nπ/L)² û(n,t)
 *                           →  û(n,t) = f̂(n)·e^{−α(nπ/L)²t}
 *   ONDA    u_tt = c² u_xx  →  û''(n,t) = −c²(nπ/L)² û(n,t)
 *                           →  û(n,t) = f̂(n)·cos(cnπt/L)     (com u_t(·,0) = 0)
 *
 * Com L = π os fatores são e^{−αn²t} e cos(cnt). Toda a diferença entre as duas
 * equações mora aí: n² num expoente negativo contra n dentro de um cosseno.
 *
 * As soluções são EXATAS, não numéricas: nenhuma diferença finita, nenhum passo
 * de tempo. O único erro é o truncamento da série, e ele é medido por Parseval.
 *
 * Como f é real, f̂(−n) = conj(f̂(n)) e a soma complexa colapsa na forma real
 *
 *   u(x,t) = a_0/2 + Σ_{n≥1} g_n(t)·(a_n cos nx + b_n sin nx),
 *
 * que é o que este arquivo implementa. Os coeficientes a_n e b_n são dados em
 * forma fechada — nada de DFT: assim não há aliasing, e a cauda do espectro,
 * que é justamente o objeto do módulo, fica exata até onde se queira somar.
 */
(function (global) {
  'use strict';

  var PI = Math.PI;

  var L = PI;              // meio-período: o círculo tem comprimento 2π
  var ALFA = 1;            // difusividade
  var C = 1;               // velocidade da onda

  /* Teto de termos na interface. Não é arbitrário: no calor para trás no tempo
   * o fator é e^{+αn²|t|}, e com N = 128 e |t| ≤ 0,016 o maior expoente vale
   * 262 — grande, e finito. Subir N ou |t| levaria a soma a Infinity, e número
   * não finito nunca chega à tela deste site. */
  var N_MAX = 128;

  /* Teto das somas de energia (Parseval). Só entra nos indicadores, nunca no
   * desenho. */
  var N_CAP = 20000;

  /* Teto da BUSCA por "quantos termos são precisos". Fica dez vezes abaixo de
   * N_CAP de propósito: perto do teto, a cauda que a soma truncada enxerga é
   * menor que a cauda verdadeira, e a resposta seria otimista por artefato.
   * Acima deste valor a resposta honesta é "mais de 2 000". */
  var BUSCA_MAX = 2000;

  var T_NEG_MIN = -0.016;  // menor tempo para trás admitido (ver N_MAX)
  var T_MIN_POS = 1e-5;    // menor tempo positivo do controle logarítmico
  var T_MAX_POS = 0.4;     // além disto só resta a média: u ≡ a_0/2
  var T_ONDA = 2 * PI;     // um período completo da onda com c = 1 e L = π

  // =========================================================================
  // Condições iniciais, com coeficientes em forma fechada
  // =========================================================================
  //
  // Convenção das notas: S_f = a_0/2 + Σ (a_n ψ_n + b_n φ_n), e portanto
  // |f̂(n)| = sqrt(a_n² + b_n²)/2 para n ≥ 1.
  //
  // `energia` é (1/2L)‖f‖² = Σ_n |f̂(n)|², calculada à mão a partir da integral
  // e conferida contra a soma dos coeficientes em testes.js — é o valor exato
  // que Parseval prevê, e serve de referência para o erro de truncamento.

  var W_PULSO = PI / 8;              // meia-largura do pulso
  var H_PULSO = PI / (2 * W_PULSO);  // altura, escolhida para ∫f = π

  var CONDICOES = [
    {
      id: 'quadrada',
      nome: 'Onda quadrada',
      classe: 'descontínua',
      latex: 'f(x)=\\pi\\,\\chi_{[0,\\pi)}(x)',
      decaimento: '|\\widehat{f}(n)|\\sim 1/n',
      a0: PI,
      a: function () { return 0; },
      b: function (n) { return (n % 2) ? 2 / n : 0; },
      energia: PI * PI / 2,
      f: function (x) {
        var r = reduzir(x);
        return r >= 0 ? PI : 0;
      },
      saltos: [0, PI],                   // um salto em 0 e outro em π
      yMin: -1.05, yMax: PI + 1.05
    },
    {
      id: 'triangular',
      nome: 'Onda triangular',
      classe: 'contínua, com bico',
      latex: 'f(x)=|x|',
      decaimento: '|\\widehat{f}(n)|\\sim 1/n^{2}',
      a0: PI,
      a: function (n) { return (n % 2) ? -4 / (PI * n * n) : 0; },
      b: function () { return 0; },
      energia: PI * PI / 3,
      f: function (x) { return Math.abs(reduzir(x)); },
      saltos: [],                        // contínua: nenhum salto
      yMin: -0.62, yMax: PI + 0.62
    },
    {
      id: 'serra',
      nome: 'Dente de serra',
      classe: 'descontínua',
      latex: 'f(x)=x',
      decaimento: '|\\widehat{f}(n)|\\sim 1/n',
      a0: 0,
      a: function () { return 0; },
      b: function (n) { return 2 * ((n % 2) ? 1 : -1) / n; },
      energia: PI * PI / 3,
      f: function (x) { return reduzir(x); },
      saltos: [PI],                      // um salto por período, no extremo
      yMin: -PI - 0.95, yMax: PI + 0.95
    },
    {
      id: 'pulso',
      nome: 'Pulso concentrado',
      classe: 'descontínua, quase um ponto',
      latex: 'f(x)=\\tfrac{\\pi}{2w}\\,\\chi_{[-w,\\,w]}(x),\\quad w=\\pi/8',
      decaimento: '|\\widehat{f}(n)|\\sim 1/n',
      a0: 1,
      /* a_n = (1/π)∫_{-w}^{w} h cos(nx) dx = sin(nw)/(wn); em n → 0 isso tende
       * a 1, que é justamente a_0 — a fórmula é contínua na origem. */
      a: function (n) { return Math.sin(n * W_PULSO) / (W_PULSO * n); },
      b: function () { return 0; },
      energia: PI / (4 * W_PULSO),
      f: function (x) { return Math.abs(reduzir(x)) < W_PULSO ? H_PULSO : 0; },
      saltos: [-W_PULSO, W_PULSO],       // as duas bordas do pulso
      yMin: -1.65, yMax: H_PULSO + 2.05
    }
  ];

  /* Reduz x ao intervalo [-π, π). */
  function reduzir(x) {
    return x - 2 * PI * Math.floor((x + PI) / (2 * PI));
  }

  function porId(id) {
    for (var i = 0; i < CONDICOES.length; i++) {
      if (CONDICOES[i].id === id) return CONDICOES[i];
    }
    return null;
  }

  /* Pontos de descontinuidade de f dentro de [x0, x1], em ordem crescente.
   * Servem para o traço da condição inicial ser interrompido no salto em vez de
   * desenhar a vertical falsa que uma amostragem ingênua produziria. */
  function descontinuidades(cond, x0, x1) {
    var base = cond.saltos || [];
    var lista = [];
    var kMin = Math.floor(x0 / (2 * PI)) - 1;
    var kMax = Math.ceil(x1 / (2 * PI)) + 1;
    for (var k = kMin; k <= kMax; k++) {
      for (var i = 0; i < base.length; i++) {
        var c = base[i] + 2 * PI * k;
        if (c > x0 && c < x1) lista.push(c);
      }
    }
    lista.sort(function (a, b) { return a - b; });
    return lista;
  }

  // =========================================================================
  // Os dois fatores temporais
  // =========================================================================

  /* g_n(t): e^{−αn²t} no calor, cos(cnt) na onda.
   *
   * No calor com t < 0 o expoente é positivo e o fator cresce como e^{αn²|t|} —
   * é exatamente essa explosão que torna o problema inverso mal-posto, e ela
   * precisa aparecer, não ser escondida. O que garante que o número continue
   * finito é o teto N_MAX combinado com T_NEG_MIN, não um clamp aqui dentro. */
  function fator(modo, n, t) {
    if (modo === 'onda') return Math.cos(C * n * t * PI / L);
    return Math.exp(-ALFA * n * n * t * PI * PI / (L * L));
  }

  /* No calor para trás no tempo a série simplesmente não converge: os
   * coeficientes crescem como e^{αn²|t|} e a cauda domina qualquer soma
   * parcial. Todo indicador construído sobre Parseval devolve null nesse caso,
   * e a interface escreve "não converge" em vez de um número sem significado. */
  function convergente(modo, t) {
    return !(modo === 'calor' && t < 0);
  }

  // =========================================================================
  // A solução
  // =========================================================================

  function limitarN(N) {
    var n = Math.round(N);
    if (!(n >= 0)) return 0;
    return Math.min(n, N_MAX);
  }

  /* u(x,t) truncada em N termos. */
  function avaliar(cond, modo, N, t, x) {
    var n = limitarN(N);
    var soma = cond.a0 / 2;
    for (var k = 1; k <= n; k++) {
      var g = fator(modo, k, t);
      if (g === 0) continue;
      var an = cond.a(k), bn = cond.b(k);
      if (an !== 0) soma += g * an * Math.cos(k * x);
      if (bn !== 0) soma += g * bn * Math.sin(k * x);
    }
    return soma;
  }

  /* u(x,t) sobre uma malha, de uma vez só: os cossenos e senos de cada modo são
   * calculados uma vez por ponto, o que evita repetir a redução de argumento em
   * N·P chamadas separadas. */
  function perfil(cond, modo, N, t, xs) {
    var n = limitarN(N);
    var P = xs.length;
    var u = new Float64Array(P);
    var i;
    for (i = 0; i < P; i++) u[i] = cond.a0 / 2;
    for (var k = 1; k <= n; k++) {
      var g = fator(modo, k, t);
      if (g === 0) continue;
      var an = cond.a(k) * g, bn = cond.b(k) * g;
      if (an === 0 && bn === 0) continue;
      for (i = 0; i < P; i++) {
        var kx = k * xs[i];
        if (an !== 0) u[i] += an * Math.cos(kx);
        if (bn !== 0) u[i] += bn * Math.sin(kx);
      }
    }
    return u;
  }

  /* Maior |u| sobre a malha: é o número que mostra a explosão do tempo para
   * trás, e o que decide se o perfil ainda cabe na escala do gráfico. */
  function amplitude(cond, modo, N, t, P) {
    var pontos = P || 512;
    var xs = new Float64Array(pontos);
    for (var i = 0; i < pontos; i++) xs[i] = -PI + 2 * PI * i / (pontos - 1);
    var u = perfil(cond, modo, N, t, xs);
    var m = 0;
    for (i = 0; i < pontos; i++) {
      var v = Math.abs(u[i]);
      if (v > m) m = v;
    }
    return m;
  }

  // =========================================================================
  // Espectro
  // =========================================================================

  /* |û(n,t)| = |f̂(n)|·|g_n(t)|, para n = 1 … N.
   * Devolve também o espectro inicial, para o gráfico mostrar quanto da cauda
   * já foi embora. Coeficientes exatamente nulos (harmônicos pares da quadrada
   * e da triangular) saem como zero e o desenho os pula: log(0) não é número. */
  function espectro(cond, modo, N, t) {
    var n = limitarN(N);
    var ns = new Int32Array(n);
    var mags = new Float64Array(n);
    var mags0 = new Float64Array(n);
    for (var k = 1; k <= n; k++) {
      var an = cond.a(k), bn = cond.b(k);
      var m0 = Math.hypot(an, bn) / 2;
      ns[k - 1] = k;
      mags0[k - 1] = m0;
      mags[k - 1] = m0 * Math.abs(fator(modo, k, t));
    }
    return { ns: ns, mags: mags, mags0: mags0 };
  }

  // =========================================================================
  // Parseval: erro de truncamento e número de termos necessários
  // =========================================================================

  /* Energia do n-ésimo modo no instante t: |f̂(n)|² + |f̂(−n)|² = (a²+b²)/2,
   * vezes g_n(t)². */
  function energiaModo(cond, modo, n, t) {
    var an = cond.a(n), bn = cond.b(n);
    var g = fator(modo, n, t);
    return 0.5 * (an * an + bn * bn) * g * g;
  }

  /* Σ_{n=1}^{ate} energiaModo. */
  function energiaAte(cond, modo, t, ate) {
    var soma = 0;
    for (var n = 1; n <= ate; n++) soma += energiaModo(cond, modo, n, t);
    return soma;
  }

  /* Energia total Σ_n |û(n,t)|², somada até N_CAP.
   *
   * Em t = 0 o valor exato é conhecido (`cond.energia`), e é ele que entra: a
   * soma truncada erraria por um fio e o erro relativo sairia otimista. Para
   * t > 0 no calor a cauda além de N_CAP é menor que e^{−2·10⁸·t} e não existe
   * em precisão dupla. Na onda a cauda além do teto é real, e é por isso que a
   * busca por termos nunca chega perto de N_CAP. */
  function energiaTotal(cond, modo, t) {
    if (!convergente(modo, t)) return null;
    if (t === 0) return cond.energia;
    return (cond.a0 / 2) * (cond.a0 / 2) + energiaAte(cond, modo, t, N_CAP);
  }

  /* Energia da cauda alem de N termos.
   *
   * Dois caminhos, e o maior vence. Subtrair do total e o caminho exato em
   * t = 0, onde a cauda pesa por volta de 1% e ainda leva junto o que ficou
   * alem de N_CAP. Mas assim que t cresce a cauda cai abaixo do ultimo bit do
   * total, a subtracao devolve zero por cancelamento, e um erro exatamente
   * nulo seria mentira de arredondamento. A soma direta dos modos n > N nao
   * cancela nada e resolve esse regime. Tomar o maximo usa cada um onde ele
   * vale.
   */
  function energiaCauda(cond, modo, t, N) {
    var total = energiaTotal(cond, modo, t);
    if (total === null) return null;
    var n = limitarN(N);
    var dentro = (cond.a0 / 2) * (cond.a0 / 2) + energiaAte(cond, modo, t, n);
    var porDiferenca = total - dentro;
    var direta = 0;
    for (var k = n + 1; k <= N_CAP; k++) direta += energiaModo(cond, modo, k, t);
    var cauda = Math.max(porDiferenca, direta);
    return cauda > 0 ? cauda : 0;
  }

  /* Erro relativo do truncamento em N termos, via Parseval:
   *   err(N) = sqrt( Σ_{n>N} |û(n)|² / Σ_{n} |û(n)|² ).
   * Devolve null quando a série não converge (calor com t < 0). */
  function erroTruncamento(cond, modo, N, t) {
    if (!convergente(modo, t)) return null;
    var total = energiaTotal(cond, modo, t);
    if (!(total > 0)) return 0;
    var cauda = energiaCauda(cond, modo, t, N);
    var r = cauda / total;
    if (!(r > 0)) return 0;
    return Math.sqrt(r > 1 ? 1 : r);
  }

  /* Menor M com err(M) < tol.
   *
   * Devolve { M, saturou }. `saturou` true significa "mais de BUSCA_MAX" — e é
   * a resposta certa em t = 0 sobre uma função descontínua, onde |f̂(n)| ~ 1/n
   * e seriam precisos ~10¹² termos. É o contraste entre esse "mais de 2 000" e
   * as poucas dezenas de termos que bastam assim que t > 0 que este módulo
   * existe para mostrar. */
  function termosPara(cond, modo, t, tol) {
    if (!convergente(modo, t)) return { M: null, saturou: false, diverge: true };
    var total = energiaTotal(cond, modo, t);
    if (!(total > 0)) return { M: 0, saturou: false, diverge: false };
    var limite = tol * tol * total;
    var dentro = (cond.a0 / 2) * (cond.a0 / 2);
    for (var M = 0; M <= BUSCA_MAX; M++) {
      if (total - dentro <= limite) return { M: M, saturou: false, diverge: false };
      dentro += energiaModo(cond, modo, M + 1, t);
    }
    return { M: null, saturou: true, diverge: false };
  }

  /* ‖u(·,t)‖ / ‖f‖, pela raiz da razão das energias.
   *
   * No calor isto cai: a energia é dissipada. Na onda ele oscila, e não porque
   * a energia se perca — a energia da onda envolve também u_t, e o que oscila é
   * a parcela que está guardada em u. */
  function normaRelativa(cond, modo, N, t) {
    if (!convergente(modo, t)) return null;
    var e0 = cond.energia;
    if (!(e0 > 0)) return null;
    var e = (cond.a0 / 2) * (cond.a0 / 2) + energiaAte(cond, modo, t, limitarN(N));
    return Math.sqrt(e / e0);
  }

  // =========================================================================
  // Mapa do controle de tempo
  // =========================================================================

  /* O tempo do calor e o tempo da onda não têm a mesma escala, e um único mapa
   * linear serviria mal aos dois. No calor o que interessa acontece entre 10⁻⁵
   * e 0,4, e o controle é logarítmico — a difusão é um fenômeno de ordens de
   * grandeza. Na onda o que interessa é um período completo, e o controle é
   * linear até 2π.
   *
   * Nos dois casos s = 0 devolve t = 0 exatamente, e s < 0 anda para trás.
   * A posição do controle é preservada ao trocar de equação: a mesma posição
   * não dá o mesmo t, mas dá o mesmo estágio, que é o que a comparação pede.
   */
  var S_MIN = -100, S_MAX = 1000;

  function tempoDe(modo, s) {
    var v = Math.max(S_MIN, Math.min(S_MAX, Math.round(s)));
    if (v === 0) return 0;
    if (modo === 'onda') {
      return T_ONDA * v / S_MAX;
    }
    if (v < 0) {
      var f = v / S_MIN;                       // 0 … 1
      return T_NEG_MIN * f * f;                // quadrático: passo fino perto de 0
    }
    var e = (v - 1) / (S_MAX - 1);             // 0 … 1
    return T_MIN_POS * Math.pow(T_MAX_POS / T_MIN_POS, e);
  }

  global.Difusao = {
    L: L, ALFA: ALFA, C: C,
    N_MAX: N_MAX, N_CAP: N_CAP, BUSCA_MAX: BUSCA_MAX,
    T_NEG_MIN: T_NEG_MIN, T_MIN_POS: T_MIN_POS, T_MAX_POS: T_MAX_POS, T_ONDA: T_ONDA,
    S_MIN: S_MIN, S_MAX: S_MAX,
    W_PULSO: W_PULSO, H_PULSO: H_PULSO,
    CONDICOES: CONDICOES,
    porId: porId,
    reduzir: reduzir,
    descontinuidades: descontinuidades,
    fator: fator,
    convergente: convergente,
    avaliar: avaliar,
    perfil: perfil,
    amplitude: amplitude,
    espectro: espectro,
    energiaModo: energiaModo,
    energiaTotal: energiaTotal,
    energiaCauda: energiaCauda,
    erroTruncamento: erroTruncamento,
    termosPara: termosPara,
    normaRelativa: normaRelativa,
    tempoDe: tempoDe
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
