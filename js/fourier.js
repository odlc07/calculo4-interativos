/* fourier.js — DFT, Parseval e ajuste log-log.
 *
 * Módulo puro: recebe números, devolve números. Não toca no DOM.
 * Carregado como script clássico (o site precisa abrir por duplo clique, e
 * `type="module"` é bloqueado em file://), registrando-se em globalThis.Fourier.
 *
 * Notação (a mesma das notas da disciplina):
 *   f̂(n) = (1/2L)⟨f, e^{-inπx/L}⟩,   S_f = Σ_{n=-∞}^{∞} f̂(n) e^{inπx/L}
 * Na versão discreta, com N amostras de z em [-π, π] (L = π):
 *   f̂(n) = (1/N) Σ_{k=0}^{N-1} z_k e^{-2πink/N},   n = -N/2 … N/2-1
 * Parseval:
 *   (1/N) Σ_k |z_k|² = Σ_n |f̂(n)|²
 */
(function (global) {
  'use strict';

  var TAU = 2 * Math.PI;

  /* --- índice ↔ frequência -------------------------------------------------
   * Os vetores devolvidos por dft() são indexados por j = 0 … N-1, com as
   * frequências em ordem crescente: n = j - N/2, ou seja, de -N/2 até N/2-1.
   */
  function indiceDe(n, N) { return n + N / 2; }
  function frequenciaDe(j, N) { return j - N / 2; }

  /* DFT direta, O(N²). Em N = 512 isso custa ~0,3 M operações complexas e roda
   * em poucos milissegundos — não há necessidade de implementar FFT aqui.
   *
   * re, im: amostras z_k = re[k] + i·im[k], k = 0 … N-1 (N par).
   * Devolve { N, freq, re, im, mag }, todos de comprimento N.
   */
  function dft(re, im) {
    var N = re.length;
    if (im.length !== N) throw new Error('dft: re e im com comprimentos diferentes.');
    if (N === 0 || N % 2 !== 0) throw new Error('dft: N precisa ser par e positivo.');

    var cRe = new Float64Array(N);
    var cIm = new Float64Array(N);
    var mag = new Float64Array(N);
    var freq = new Int32Array(N);

    for (var j = 0; j < N; j++) {
      var n = frequenciaDe(j, N);
      var sr = 0, si = 0;
      for (var k = 0; k < N; k++) {
        // e^{-2πink/N}; n·k é reduzido a [0, N) para não perder precisão no
        // argumento quando o produto fica grande.
        var nk = (((n * k) % N) + N) % N;
        var ang = -TAU * nk / N;
        var c = Math.cos(ang), s = Math.sin(ang);
        sr += re[k] * c - im[k] * s;
        si += re[k] * s + im[k] * c;
      }
      freq[j] = n;
      cRe[j] = sr / N;
      cIm[j] = si / N;
      mag[j] = Math.hypot(cRe[j], cIm[j]);
    }
    return { N: N, freq: freq, re: cRe, im: cIm, mag: mag };
  }

  /* Coeficiente f̂(n) avulso. Devolve null se n estiver fora de [-N/2, N/2-1]. */
  function coeficiente(coef, n) {
    var j = indiceDe(n, coef.N);
    if (j < 0 || j >= coef.N) return null;
    return { n: n, re: coef.re[j], im: coef.im[j], mag: coef.mag[j] };
  }

  /* Energia espectral Σ_n |f̂(n)|². */
  function energia(coef) {
    var soma = 0;
    for (var j = 0; j < coef.N; j++) soma += coef.mag[j] * coef.mag[j];
    return soma;
  }

  /* Erro relativo da reconstrução truncada em |n| ≤ M, via Parseval:
   *   err(M) = sqrt( Σ_{|n|>M} |f̂(n)|² ) / sqrt( Σ_{todos n} |f̂(n)|² )
   * Devolve fração em [0, 1] (a interface converte para porcentagem).
   */
  function erroParseval(coef, M) {
    var cauda = 0, total = 0;
    for (var j = 0; j < coef.N; j++) {
      var p = coef.mag[j] * coef.mag[j];
      total += p;
      if (Math.abs(coef.freq[j]) > M) cauda += p;
    }
    if (!(total > 0)) return 0;
    var r = cauda / total;
    if (!(r > 0)) return 0;              // mata -0 e negativos de arredondamento
    return Math.sqrt(r > 1 ? 1 : r);
  }

  /* Soma parcial S_M(t) = Σ_{|n| ≤ M} f̂(n) e^{int}, num único t. */
  function avaliarParcial(coef, M, t) {
    var re = 0, im = 0;
    for (var j = 0; j < coef.N; j++) {
      var n = coef.freq[j];
      if (n > M || n < -M) continue;
      var ang = n * t;
      var c = Math.cos(ang), s = Math.sin(ang);
      re += coef.re[j] * c - coef.im[j] * s;
      im += coef.re[j] * s + coef.im[j] * c;
    }
    return { re: re, im: im };
  }

  /* Soma parcial amostrada em P pontos de t ∈ [0, 2π). */
  function reconstruir(coef, M, P) {
    var re = new Float64Array(P);
    var im = new Float64Array(P);
    for (var p = 0; p < P; p++) {
      var v = avaliarParcial(coef, M, TAU * p / P);
      re[p] = v.re;
      im[p] = v.im;
    }
    return { re: re, im: im };
  }

  /* Termos com |n| ≤ M ordenados por módulo decrescente.
   * Ordem de DESENHO dos epiciclos (escolha visual); a soma matemática continua
   * sendo sobre |n| ≤ M, e a página precisa dizer isso.
   */
  function termosPorModulo(coef, M) {
    var lista = [];
    for (var j = 0; j < coef.N; j++) {
      var n = coef.freq[j];
      if (n > M || n < -M) continue;
      lista.push({ n: n, re: coef.re[j], im: coef.im[j], mag: coef.mag[j] });
    }
    lista.sort(function (a, b) { return b.mag - a.mag || a.n - b.n; });
    return lista;
  }

  /* Mínimos quadrados de y = a·x + b, com o R² do ajuste. */
  function ajustarReta(xs, ys) {
    var m = xs.length, i;
    var sx = 0, sy = 0;
    for (i = 0; i < m; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / m, my = sy / m;
    var sxx = 0, sxy = 0;
    for (i = 0; i < m; i++) {
      var dx = xs[i] - mx;
      sxx += dx * dx;
      sxy += dx * (ys[i] - my);
    }
    if (!(sxx > 0)) return null;
    var a = sxy / sxx, b = my - a * mx;
    var ssRes = 0, ssTot = 0;
    for (i = 0; i < m; i++) {
      var r = ys[i] - (a * xs[i] + b);
      var d = ys[i] - my;
      ssRes += r * r;
      ssTot += d * d;
    }
    return { a: a, b: b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  }

  /* Coleta os pares (n, log|f̂(n)|) utilizáveis na faixa pedida.
   * Coeficientes abaixo de tol são descartados: muitas dessas curvas têm
   * simetria e os zeram exatamente, e log(0) não é número. */
  function amostrasEspectrais(coef, o) {
    var nMin = Math.max(1, o.nMin === undefined ? 2 : o.nMin);
    var nMax = Math.min(o.nMax === undefined ? 48 : o.nMax, coef.N / 2 - 1);
    var tol = o.tol === undefined ? 1e-7 : o.tol;
    var ns = [], logs = [];
    for (var n = nMin; n <= nMax; n++) {
      var c = coeficiente(coef, n);
      if (c && c.mag > tol) { ns.push(n); logs.push(Math.log(c.mag)); }
    }
    return { ns: ns, logs: logs };
  }

  /* Expoente de decaimento: mínimos quadrados de log|f̂(n)| contra log n,
   * usando só n ∈ [nMin, nMax] com |f̂(n)| > tol.
   *
   * Muitas dessas curvas têm simetria e zeram coeficientes exatamente; o corte
   * por tol existe para que log(0) nunca entre no ajuste. Com menos de 5 pontos
   * válidos não há ajuste — o espectro é finito (ou quase).
   *
   * Devolve { ok, expoente, intercepto, pontos, r2, motivo }.
   */
  function ajusteLogLog(coef, opcoes) {
    var o = opcoes || {};
    var minPontos = o.minPontos === undefined ? 5 : o.minPontos;
    var am = amostrasEspectrais(coef, o);
    var m = am.ns.length;
    var vazio = { ok: false, motivo: 'espectro finito', pontos: m,
                  expoente: NaN, intercepto: NaN, r2: NaN };
    if (m < minPontos) return vazio;

    var xs = new Array(m);
    for (var i = 0; i < m; i++) xs[i] = Math.log(am.ns[i]);
    var r = ajustarReta(xs, am.logs);
    if (!r) return vazio;

    // a inclinação em log-log é o expoente de decaimento
    return { ok: true, motivo: '', pontos: m,
             expoente: r.a, intercepto: r.b, r2: r.r2 };
  }

  /* Decaimento exponencial: mínimos quadrados de log|f̂(n)| contra n (semi-log).
   *
   * Existe porque nem todo espectro é lei de potência. Uma curva ANALÍTICA tem
   * coeficientes que decaem como e^{-cn}, e forçar uma reta em log-log sobre
   * isso produz um "expoente" que não descreve nada. Comparar os dois ajustes é
   * o que permite dizer qual dos dois modelos a curva realmente obedece.
   */
  function ajusteSemiLog(coef, opcoes) {
    var o = opcoes || {};
    var minPontos = o.minPontos === undefined ? 5 : o.minPontos;
    var am = amostrasEspectrais(coef, o);
    var m = am.ns.length;
    var vazio = { ok: false, motivo: 'espectro finito', pontos: m,
                  taxa: NaN, intercepto: NaN, r2: NaN };
    if (m < minPontos) return vazio;

    var r = ajustarReta(am.ns, am.logs);
    if (!r) return vazio;

    // a inclinação em semi-log é a taxa c de e^{-cn}
    return { ok: true, motivo: '', pontos: m,
             taxa: r.a, intercepto: r.b, r2: r.r2 };
  }

  /* Classifica o decaimento comparando os dois modelos pelo R².
   *
   * A margem existe porque uma diferença pequena de R² entre dois ajustes sobre
   * ~40 pontos não decide nada: nesse caso a resposta honesta é "indeciso", e
   * não a do modelo que ganhou por um fio.
   *
   * Devolve { modelo, rotulo, potencia, exponencial, margem }, com modelo em
   * 'finito' | 'potencia' | 'exponencial' | 'indeciso'.
   */
  function classificarDecaimento(coef, opcoes) {
    var o = opcoes || {};
    var margem = o.margem === undefined ? 0.02 : o.margem;
    var potencia = ajusteLogLog(coef, o);
    var exponencial = ajusteSemiLog(coef, o);

    var modelo, rotulo;
    if (!potencia.ok && !exponencial.ok) {
      modelo = 'finito';
      rotulo = 'espectro finito';
    } else if (!exponencial.ok) {
      modelo = 'potencia';
      rotulo = 'lei de potência';
    } else if (!potencia.ok) {
      modelo = 'exponencial';
      rotulo = 'decaimento exponencial';
    } else if (exponencial.r2 > potencia.r2 + margem) {
      modelo = 'exponencial';
      rotulo = 'decaimento exponencial';
    } else if (potencia.r2 > exponencial.r2 + margem) {
      modelo = 'potencia';
      rotulo = 'lei de potência';
    } else {
      modelo = 'indeciso';
      rotulo = 'indeciso nesta faixa';
    }

    return { modelo: modelo, rotulo: rotulo, margem: margem,
             potencia: potencia, exponencial: exponencial };
  }

  global.Fourier = {
    indiceDe: indiceDe,
    frequenciaDe: frequenciaDe,
    dft: dft,
    coeficiente: coeficiente,
    energia: energia,
    erroParseval: erroParseval,
    avaliarParcial: avaliarParcial,
    reconstruir: reconstruir,
    termosPorModulo: termosPorModulo,
    ajustarReta: ajustarReta,
    amostrasEspectrais: amostrasEspectrais,
    ajusteLogLog: ajusteLogLog,
    ajusteSemiLog: ajusteSemiLog,
    classificarDecaimento: classificarDecaimento
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
