/* ondas.js — onda triangular e onda quadrada: séries, erros e identidades.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Ondas (script clássico, ver fourier.js).
 *
 * TRIANGULAR — f(x) = |x| em [-1, 1], L = 1, estendida com período 2.
 *   Contínua e com derivada seccionalmente contínua: satisfaz as hipóteses do
 *   teorema de convergência uniforme.
 *   S_f(x) = 1/2 − Σ_{n≥1} (2/((2n−1)π))² cos((2n−1)πx)
 *
 * QUADRADA — f(x) = π·χ_{[0,π)}(x) em [-π, π], L = π, período 2π.
 *   Descontínua: NÃO satisfaz as hipóteses.
 *   S_f(x) = π/2 + Σ_{n≥1} (2/(2n−1)) sin((2n−1)x)
 *
 * (Sobre o período: as notas dizem "2-periódica" no exemplo da quadrada, mas
 * com L = π a extensão é 2π-periódica, e a própria série apresentada em
 * seguida tem período 2π. Implementado com 2π, que é o correto.)
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var TAU = 2 * PI;

  // ---- constantes exatas ---------------------------------------------------
  var PI2_8 = PI * PI / 8;                 // Σ 1/(2n−1)²
  var PI_4 = PI / 4;                       // Σ (−1)^{n+1}/(2n−1)
  var PI4_96 = Math.pow(PI, 4) / 96;       // Σ 1/(2n−1)⁴

  /* Si(π) = ∫_0^π (sin t)/t dt, por Simpson. Aparece no limite de Gibbs.
   * Calculado em vez de transcrito para que o valor possa ser conferido. */
  function integralSenoCardinal(limite, m) {
    var h = limite / m, soma = 0;
    function g(t) { return t === 0 ? 1 : Math.sin(t) / t; }
    for (var i = 0; i <= m; i++) {
      var peso = (i === 0 || i === m) ? 1 : (i % 2 ? 4 : 2);
      soma += peso * g(i * h);
    }
    return soma * h / 3;
  }
  var SI_PI = integralSenoCardinal(PI, 4000);   // 1,8519370519...

  /* Limite do overshoot de Gibbs para um salto de altura π.
   * O máximo de S_N tende a π/2 + Si(π); o excesso sobre o valor π da função é
   * Si(π) − π/2 ≈ 0,2811, ou seja, 8,95% do salto. */
  var GIBBS = SI_PI - PI / 2;
  var GIBBS_FRACAO = GIBBS / PI;

  // =========================================================================
  // Onda triangular
  // =========================================================================

  /* Coeficiente do n-ésimo termo presente: a_{2n−1} = −(2/((2n−1)π))². */
  function coefTriangular(n) {
    var k = 2 * n - 1;
    var c = 2 / (k * PI);
    return c * c;
  }

  var triangular = {
    id: 'triangular',
    nome: 'Onda triangular',
    L: 1,
    periodo: 2,
    // faixa vertical usada pelos gráficos
    yMin: -0.25, yMax: 1.25,

    f: function (x) {
      var r = x - 2 * Math.round(x / 2);      // reduz a [-1, 1]
      return Math.abs(r);
    },

    S: function (x, N) {
      var soma = 0;
      for (var n = 1; n <= N; n++) soma += coefTriangular(n) * Math.cos((2 * n - 1) * PI * x);
      return 0.5 - soma;
    },

    /* ‖f − S_N‖_∞ em forma fechada.
     * O resto é Σ_{n>N} c_n cos((2n−1)πx) com c_n > 0; o módulo da soma é
     * máximo quando todos os cossenos valem ±1 ao mesmo tempo, isto é em x = 0
     * (e em x = ±1). Logo o sup do erro é exatamente a cauda Σ_{n>N} c_n, que
     * por sua vez é o resto da identidade Σ 1/(2n−1)² = π²/8. */
    supErro: function (N) {
      var soma = 0;
      for (var n = 1; n <= N; n++) soma += coefTriangular(n);
      var r = 0.5 - soma;
      return r > 0 ? r : 0;
    },

    // ponto onde o sup é atingido, para o gráfico marcar
    argSupErro: function () { return 0; }
  };

  // =========================================================================
  // Onda quadrada
  // =========================================================================

  var quadrada = {
    id: 'quadrada',
    nome: 'Onda quadrada',
    L: PI,
    periodo: TAU,
    salto: PI,
    yMin: -0.9, yMax: PI + 0.9,

    f: function (x) {
      var r = x - TAU * Math.floor((x + PI) / TAU);   // reduz a [-π, π)
      return r >= 0 ? PI : 0;
    },

    S: function (x, N) {
      var soma = 0;
      for (var n = 1; n <= N; n++) {
        var k = 2 * n - 1;
        soma += Math.sin(k * x) / k;
      }
      return PI / 2 + 2 * soma;
    },

    /* ‖f − S_N‖_∞ = π/2, EXATAMENTE, para todo N.
     * Toda soma parcial vale π/2 nos pontos de salto (x = 0, ±π), onde f vale π
     * ou 0. O erro máximo, portanto, nunca diminui: é a falha da convergência
     * uniforme na forma mais crua. O overshoot de Gibbs (abaixo) é o fenômeno
     * mais fino, e é o que se compara com os 8,95% do salto. */
    supErro: function () { return PI / 2; },

    /* Overshoot de Gibbs: quanto S_N ultrapassa o patamar π logo depois do salto.
     * S_N'(x) = Σ 2cos((2n−1)x) = sin(2Nx)/sin(x), então o primeiro máximo está
     * exatamente em x = π/(2N) — não é preciso varrer malha nenhuma. */
    argOvershoot: function (N) { return PI / (2 * N); },

    overshoot: function (N) {
      return quadrada.S(PI / (2 * N), N) - PI;
    }
  };

  // =========================================================================
  // As três identidades das notas
  // =========================================================================

  var identidades = [
    {
      id: 'basileia-impares',
      origem: 'Triangular em x = 0',
      soma: '\\sum_{n=1}^{N} \\frac{1}{(2n-1)^2}',
      limite: '\\frac{\\pi^2}{8}',
      exato: PI2_8,
      parcial: function (N) {
        var s = 0;
        for (var n = 1; n <= N; n++) { var k = 2 * n - 1; s += 1 / (k * k); }
        return s;
      }
    },
    {
      id: 'leibniz',
      origem: 'Quadrada em x = π/2',
      soma: '\\sum_{n=1}^{N} \\frac{(-1)^{n+1}}{2n-1}',
      limite: '\\frac{\\pi}{4}',
      exato: PI_4,
      parcial: function (N) {
        var s = 0;
        for (var n = 1; n <= N; n++) s += (n % 2 ? 1 : -1) / (2 * n - 1);
        return s;
      }
    },
    {
      id: 'parseval-triangular',
      origem: 'Parseval na triangular',
      soma: '\\sum_{n=1}^{N} \\frac{1}{(2n-1)^4}',
      limite: '\\frac{\\pi^4}{96}',
      exato: PI4_96,
      parcial: function (N) {
        var s = 0;
        for (var n = 1; n <= N; n++) { var k = 2 * n - 1, k2 = k * k; s += 1 / (k2 * k2); }
        return s;
      }
    }
  ];

  global.Ondas = {
    PI2_8: PI2_8,
    PI_4: PI_4,
    PI4_96: PI4_96,
    SI_PI: SI_PI,
    GIBBS: GIBBS,
    GIBBS_FRACAO: GIBBS_FRACAO,
    integralSenoCardinal: integralSenoCardinal,
    coefTriangular: coefTriangular,
    triangular: triangular,
    quadrada: quadrada,
    identidades: identidades
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
