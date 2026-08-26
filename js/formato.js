/* formato.js — número em português, para a tela.
 *
 * Módulo puro: recebe números, devolve texto. Não toca no DOM.
 * Registra-se em globalThis.Formato (script clássico, ver fourier.js).
 *
 * Existe porque duas regras do projeto valem em todos os módulos e estavam
 * sendo reescritas em cada controlador:
 *
 *   1. vírgula decimal e sinal de menos tipográfico (−, não o hífen);
 *   2. nada de NaN, Infinity ou notação exponencial crua na tela.
 *
 * A segunda ficou séria com os módulos 5 e 6, que produzem números de ordem
 * 10¹¹⁰ (o calor no tempo para trás) e 10⁻²¹ (o erro de truncamento assim que
 * t > 0). Um `toExponential` cru escreveria "1.876e+110"; aqui sai
 * "1,876 × 10¹¹⁰".
 */
(function (global) {
  'use strict';

  var SUPER = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

  var AUSENTE = '—';

  /* Acima de 10²¹ o próprio JavaScript desiste do decimal: `toFixed` e
   * `toLocaleString` passam a devolver "1e+22". Ou seja, a regra de nunca
   * mostrar exponencial crua não se cumpre só evitando `toExponential` — é
   * preciso interceptar essa faixa. */
  var LIMITE_DECIMAL = 1e21;

  /* `isFinite(null)` é true, porque null vira 0 na conversão — e o mesmo vale
   * para a string vazia. Um indicador que recebeu null por engano deve mostrar
   * travessão, não um zero convincente. Daí a checagem de tipo. */
  function finito(v) { return typeof v === 'number' && isFinite(v); }

  /* Expoente em algarismos sobrescritos: 110 → "¹¹⁰", −21 → "⁻²¹". */
  function expoente(k) {
    var s = String(k), r = '';
    for (var i = 0; i < s.length; i++) r += SUPER[s.charAt(i)] || s.charAt(i);
    return r;
  }

  /* Decimal com vírgula e menos tipográfico. */
  function br(v, casas) {
    if (!finito(v)) return AUSENTE;
    if (Math.abs(v) >= LIMITE_DECIMAL) return cientifica(v, casas === undefined ? 2 : casas);
    var d = casas === undefined ? 4 : casas;
    return v.toFixed(d).replace('.', ',').replace('-', '−');
  }

  /* Inteiro com separador de milhar. */
  function inteiro(v) {
    if (!finito(v)) return AUSENTE;
    if (Math.abs(v) >= LIMITE_DECIMAL) return cientifica(v, 2);
    return Math.round(v).toLocaleString('pt-BR');
  }

  /* "1,88 × 10¹¹⁰". */
  function cientifica(v, casas) {
    if (!finito(v)) return AUSENTE;
    if (v === 0) return '0';
    var d = casas === undefined ? 2 : casas;
    var k = Math.floor(Math.log10(Math.abs(v)));
    var m = v / Math.pow(10, k);
    /* Arredondar a mantissa pode empurrá-la para 10 — 9,999 com duas casas vira
     * "10,00 × 10ⁿ", que está certo e se lê mal. Sobe o expoente. */
    if (Math.abs(Number(m.toFixed(d))) >= 10) { m /= 10; k += 1; }
    // |m| < 10 sempre, então o br abaixo nunca volta a chamar cientifica
    return br(m, d) + ' × 10' + expoente(k);
  }

  /* Escolhe entre decimal e científica pela ordem de grandeza.
   * `baixo` e `alto` delimitam a faixa em que o decimal ainda se lê bem. */
  function numero(v, opcoes) {
    if (!finito(v)) return AUSENTE;
    var o = opcoes || {};
    var baixo = o.baixo === undefined ? 1e-3 : o.baixo;
    var alto = o.alto === undefined ? 1e5 : o.alto;
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a < baixo || a >= alto) return cientifica(v, o.casasCientifica);
    return br(v, o.casas === undefined ? 4 : o.casas);
  }

  /* Percentual, com o mesmo cuidado. */
  function porcento(v, casas) {
    if (!finito(v)) return AUSENTE;
    return br(100 * v, casas === undefined ? 2 : casas) + '%';
  }

  global.Formato = {
    AUSENTE: AUSENTE,
    expoente: expoente,
    br: br,
    inteiro: inteiro,
    cientifica: cientifica,
    numero: numero,
    porcento: porcento
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
