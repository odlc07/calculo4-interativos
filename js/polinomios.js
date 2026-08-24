/* polinomios.js — recorrências lineares, função geratriz e raio de convergência.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Registra-se em globalThis.Polinomios (script clássico, ver fourier.js).
 *
 * Dada a recorrência linear α_{n+k} = c₁·α_{n+k-1} + … + c_k·α_n, a função
 * geratriz f(x) = Σ α_n xⁿ é racional:
 *
 *     f(x) = P(x) / Q(x),   com   Q(x) = 1 − c₁x − c₂x² − … − c_k x^k
 *
 * Multiplicando f por Q, todo coeficiente de xᵐ com m ≥ k se anula pela própria
 * recorrência, e sobra um P de grau menor que k. O raio de convergência é
 *
 *     R = min{ |z| : Q(z) = 0 },  incluindo raízes complexas,
 *
 * ou seja, a distância da origem até a singularidade mais próxima de f.
 */
(function (global) {
  'use strict';

  // ---- aritmética complexa mínima -----------------------------------------
  function cpx(re, im) { return { re: re, im: im || 0 }; }
  function cSoma(a, b) { return cpx(a.re + b.re, a.im + b.im); }
  function cSub(a, b) { return cpx(a.re - b.re, a.im - b.im); }
  function cMul(a, b) { return cpx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cDiv(a, b) {
    var d = b.re * b.re + b.im * b.im;
    if (!(d > 0)) return cpx(NaN, NaN);
    return cpx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }
  function cMod(a) { return Math.hypot(a.re, a.im); }

  /* Q a partir dos coeficientes da recorrência: Q = 1 − c₁x − c₂x² − …
   * Devolve os coeficientes em ordem crescente de grau. */
  function denominador(c) {
    var q = [1];
    for (var i = 0; i < c.length; i++) q.push(-c[i]);
    return q;
  }

  /* P a partir de Q e dos valores iniciais.
   *   p_m = Σ_{j=0}^{m} q_j · α_{m−j},   m = 0 … k−1
   * Os termos com m ≥ k somem por construção — é exatamente a recorrência. */
  function numerador(alfa, c) {
    var q = denominador(c);
    var k = c.length;
    var p = [];
    for (var m = 0; m < k; m++) {
      var s = 0;
      for (var j = 0; j <= m; j++) s += q[j] * alfa[m - j];
      p.push(s);
    }
    // corta zeros no topo, preservando ao menos o termo constante
    while (p.length > 1 && p[p.length - 1] === 0) p.pop();
    return p;
  }

  function grau(poli) {
    for (var i = poli.length - 1; i >= 0; i--) if (poli[i] !== 0) return i;
    return -1;
  }

  /* Raízes de um polinômio dado em ordem crescente de grau.
   * Grau 1 e 2 saem em forma fechada; grau 3 por Durand–Kerner.
   * Sem biblioteca externa. */
  function raizesDePolinomio(q) {
    var g = grau(q);
    if (g <= 0) return [];                    // constante: nenhuma raiz

    if (g === 1) return [cpx(-q[0] / q[1], 0)];

    if (g === 2) {
      var a = q[2], b = q[1], c0 = q[0];
      var disc = b * b - 4 * a * c0;
      if (disc >= 0) {
        var r = Math.sqrt(disc);
        return [cpx((-b + r) / (2 * a), 0), cpx((-b - r) / (2 * a), 0)];
      }
      // discriminante negativo: par de conjugadas
      var im = Math.sqrt(-disc) / (2 * a);
      var re = -b / (2 * a);
      return [cpx(re, Math.abs(im)), cpx(re, -Math.abs(im))];
    }

    return durandKerner(q, g);
  }

  /* Durand–Kerner: todas as raízes de uma vez, sem derivada.
   * Os pontos iniciais são potências de um complexo genérico, para não caírem
   * simétricos e travarem a iteração. */
  function durandKerner(q, g) {
    var lider = q[g];
    var mon = [];
    var i, j;
    for (i = 0; i <= g; i++) mon.push(q[i] / lider);

    function avaliar(z) {
      var s = cpx(0, 0);
      for (var m = g; m >= 0; m--) s = cSoma(cMul(s, z), cpx(mon[m], 0));
      return s;
    }

    var z = [], semente = cpx(0.4, 0.9), atual = cpx(1, 0);
    for (i = 0; i < g; i++) { z.push(atual); atual = cMul(atual, semente); }

    for (var passo = 0; passo < 500; passo++) {
      var maior = 0;
      for (i = 0; i < g; i++) {
        var den = cpx(1, 0);
        for (j = 0; j < g; j++) if (j !== i) den = cMul(den, cSub(z[i], z[j]));
        var delta = cDiv(avaliar(z[i]), den);
        if (!isFinite(delta.re) || !isFinite(delta.im)) continue;
        z[i] = cSub(z[i], delta);
        maior = Math.max(maior, cMod(delta));
      }
      if (maior < 1e-15) break;
    }
    // limpa resíduo imaginário de raízes que na verdade são reais
    for (i = 0; i < g; i++) if (Math.abs(z[i].im) < 1e-11) z[i] = cpx(z[i].re, 0);
    return z;
  }

  /* Raio de convergência e a raiz que o realiza.
   * Sem raízes (Q constante), f é polinômio e R = ∞ — caso que precisa ser
   * dito na tela, não virar divisão por zero. */
  function raio(raizes) {
    if (!raizes.length) {
      return { R: Infinity, indice: -1, dominante: false, motivo: 'polinomio' };
    }
    var melhor = 0;
    for (var i = 1; i < raizes.length; i++) {
      if (cMod(raizes[i]) < cMod(raizes[melhor])) melhor = i;
    }
    var R = cMod(raizes[melhor]);

    /* α_{n+1}/α_n → 1/R só vale se a raiz dominante for única e simples.
     * Com dois módulos iguais a razão oscila e não converge — é o caso de
     * Q = 1 + x², raízes ±i. Detectar isso evita desenhar uma reta de limite
     * onde limite não há. */
    var dominante = true;
    for (i = 0; i < raizes.length; i++) {
      if (i === melhor) continue;
      if (Math.abs(cMod(raizes[i]) - R) < 1e-9) { dominante = false; break; }
    }
    return { R: R, indice: melhor, dominante: dominante,
             motivo: dominante ? '' : 'modulos-iguais' };
  }

  // ---- termos da sequência -------------------------------------------------

  function saoInteiros(v) {
    for (var i = 0; i < v.length; i++) {
      if (!isFinite(v[i]) || Math.floor(v[i]) !== v[i]) return false;
    }
    return true;
  }

  /* Razão de dois BigInt com precisão de ponto flutuante.
   * Dividir ANTES de converter: Number(a)/Number(b) perde tudo assim que os
   * termos passam de 2^53, e o crescimento aqui é exponencial. */
  var ESCALA = BigInt('1000000000000000000');   // 1e18
  function razaoBig(a, b) {
    if (b === BigInt(0)) return NaN;
    var zero = BigInt(0);
    var neg = (a < zero) !== (b < zero);
    var aa = a < zero ? -a : a;
    var bb = b < zero ? -b : b;
    var v = Number((aa * ESCALA) / bb) / 1e18;
    return neg ? -v : v;
  }

  /* Os primeiros termos. Com entradas inteiras usa BigInt, porque α_n cresce
   * como (1/R)^n e estoura Number em poucas dezenas de passos.
   * Devolve { termos, exatos, razoes }. Em `razoes` entra NaN onde a razão
   * não existe (termo anterior nulo) — a interface precisa filtrar isso antes
   * de escrever na tela. */
  function termos(alfa, c, n) {
    var k = c.length;
    var limite = Math.min(n === undefined ? 30 : n, 60);
    var inteiro = saoInteiros(alfa.slice(0, k)) && saoInteiros(c);
    var m, j;

    if (inteiro) {
      var big = alfa.slice(0, k).map(function (v) { return BigInt(v); });
      var cb = c.map(function (v) { return BigInt(v); });
      for (m = k; m <= limite; m++) {
        var s = BigInt(0);
        for (j = 0; j < k; j++) s += cb[j] * big[m - 1 - j];
        big.push(s);
      }
      var razoes = [];
      for (m = 0; m + 1 < big.length; m++) razoes.push(razaoBig(big[m + 1], big[m]));
      return {
        exatos: big,
        termos: big.map(function (v) { return Number(v); }),
        razoes: razoes
      };
    }

    var t = alfa.slice(0, k);
    for (m = k; m <= limite; m++) {
      var v = 0;
      for (j = 0; j < k; j++) v += c[j] * t[m - 1 - j];
      if (!isFinite(v) || Math.abs(v) > 1e300) break;
      t.push(v);
    }
    var rz = [];
    for (m = 0; m + 1 < t.length; m++) rz.push(t[m] === 0 ? NaN : t[m + 1] / t[m]);
    return { exatos: null, termos: t, razoes: rz };
  }

  /* Tudo de uma vez, que é o que a página consome. */
  function analisar(alfa, c, n) {
    var q = denominador(c);
    var p = numerador(alfa, c);
    var rz = raizesDePolinomio(q);
    var r = raio(rz);
    var seq = termos(alfa, c, n);
    return {
      P: p, Q: q,
      raizes: rz,
      R: r.R,
      raizMinima: r.indice >= 0 ? rz[r.indice] : null,
      indiceMinima: r.indice,
      dominante: r.dominante,
      motivo: r.motivo,
      taxa: isFinite(r.R) && r.R > 0 ? 1 / r.R : Infinity,
      termos: seq.termos,
      exatos: seq.exatos,
      razoes: seq.razoes
    };
  }

  /* Polinômio em LaTeX. Sai em ordem CRESCENTE de grau por padrão: como
   * Q(0) = 1 por construção, "1 - x - 2x^2" lê melhor que "-2x^2 - x + 1" e
   * casa com a forma em que a recorrência é enunciada. */
  function paraLatex(poli, variavel, decrescente) {
    var v = variavel || 'x';
    var partes = [];
    var ini = decrescente ? poli.length - 1 : 0;
    var fim = decrescente ? -1 : poli.length;
    var passo = decrescente ? -1 : 1;
    for (var i = ini; i !== fim; i += passo) {
      var a = poli[i];
      if (a === 0) continue;
      var mag = Math.abs(a);
      var corpo;
      if (i === 0) corpo = String(mag);
      else {
        var coef = mag === 1 ? '' : String(mag);
        corpo = coef + v + (i === 1 ? '' : '^{' + i + '}');
      }
      if (partes.length === 0) partes.push((a < 0 ? '-' : '') + corpo);
      else partes.push(' ' + (a < 0 ? '-' : '+') + ' ' + corpo);
    }
    return partes.length ? partes.join('') : '0';
  }

  global.Polinomios = {
    cpx: cpx,
    cMod: cMod,
    denominador: denominador,
    numerador: numerador,
    grau: grau,
    raizesDePolinomio: raizesDePolinomio,
    raio: raio,
    termos: termos,
    analisar: analisar,
    paraLatex: paraLatex
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
