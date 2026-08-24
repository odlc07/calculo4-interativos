/* testes.js — asserções sobre fourier.js e curvas.js.
 *
 * Puro: devolve uma lista de resultados. Quem desenha é o testes.html.
 * A mesma suíte roda headless (node) e no navegador, para não haver duas
 * versões da verdade sobre o que passou.
 */
(function (global) {
  'use strict';

  var casos = [];
  function teste(grupo, nome, fn) { casos.push({ grupo: grupo, nome: nome, fn: fn }); }

  // ---- asserções -----------------------------------------------------------
  function falhar(msg) { throw new Error(msg); }
  function ok(cond, msg) { if (!cond) falhar(msg); }
  function num(v) {
    if (typeof v !== 'number' || !isFinite(v)) falhar('valor não finito: ' + v);
    return v;
  }
  function aprox(a, b, tol, rotulo) {
    num(a); num(b);
    var d = Math.abs(a - b);
    if (d > tol) falhar(rotulo + ': |' + fmt(a) + ' − ' + fmt(b) + '| = ' + fmt(d) + ' > ' + fmt(tol));
    return d;
  }
  function abaixo(v, lim, rotulo) {
    num(v);
    if (!(v < lim)) falhar(rotulo + ': ' + fmt(v) + ' não é < ' + fmt(lim));
    return v;
  }
  function fmt(v) {
    if (typeof v !== 'number') return String(v);
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a < 1e-3 || a >= 1e5) return v.toExponential(3);
    return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }

  // ---- utilidades ----------------------------------------------------------
  var TAU = 2 * Math.PI;
  var PI_TESTE = Math.PI;
  var TOL = {
    inversao: 1e-11,      // reconstrução completa vs. amostras
    parseval: 1e-12,      // identidade de Parseval (erro relativo)
    zeroEspectral: 1e-12, // coeficiente considerado nulo
    algebrico: 1e-12,     // equação implícita da curva
    // Dispersão relativa do comprimento de arco entre pontos consecutivos.
    // O piso não é do algoritmo: na superelipse de Fermat a velocidade é
    // infinita nos quatro pontos sobre os eixos, e em precisão dupla não há
    // parâmetro representável perto o bastante deles — sobra um resíduo de
    // ~0,1% em 8 dos 512 espaçamentos. As demais curvas ficam abaixo de 1e-5.
    arco: 1e-3
  };

  function todasCurvas() { return global.Curvas.CURVAS; }

  function coefDe(curva, arco) {
    var am = global.Curvas.amostrar(curva, { N: 512, arco: arco });
    return { am: am, coef: global.Fourier.dft(am.re, am.im) };
  }

  /* Malha de referência: bem mais fina que a usada na reamostragem, e com
   * orçamento folgado para não saturar — uma tabela saturada mede errado e
   * invalidaria o teste em vez da implementação.
   */
  var cacheFina = {};
  function malhaFina(curva) {
    var c = global.Curvas.porId(typeof curva === 'string' ? curva : curva.id) || curva;
    var chave = c.id || String(curva);
    if (!cacheFina[chave]) {
      var t = global.Curvas.amostrarDenso(c, 60000,
        { limiar: 65536, maxPontos: 4000000, maxPassos: 200 });
      ok(!t.saturou, 'malha de referência de ' + chave + ' estourou o orçamento');
      cacheFina[chave] = t;
    }
    return cacheFina[chave];
  }

  /* Comprimento de arco entre pontos consecutivos, medido na malha de
   * referência. É isso que valida a reparametrização — a distância em linha
   * reta não serve: perto de uma cúspide a curva dobra sobre si mesma e a
   * corda encolhe mesmo com o arco constante.
   */
  function comprimentosEntrePontos(curva, s) {
    var fina = malhaFina(curva);
    var N = s.length;
    var d = new Float64Array(N);
    for (var k = 0; k < N; k++) {
      var a = global.Curvas.comprimentoAte(fina, s[k]);
      var b = (k + 1 < N) ? global.Curvas.comprimentoAte(fina, s[k + 1]) : fina.total;
      d[k] = b - a;
    }
    return d;
  }

  function dispersaoRelativa(v) {
    var n = v.length, soma = 0;
    for (var i = 0; i < n; i++) soma += v[i];
    var media = soma / n;
    var acc = 0;
    for (i = 0; i < n; i++) { var e = v[i] - media; acc += e * e; }
    return Math.sqrt(acc / n) / media;
  }

  // =========================================================================
  // 1. Parametrizações
  // =========================================================================

  teste('Curvas', 'As seis curvas estão registradas com id único', function () {
    var cs = todasCurvas();
    ok(cs.length === 6, 'esperava 6 curvas, achei ' + cs.length);
    var vistos = {};
    for (var i = 0; i < cs.length; i++) {
      ok(!vistos[cs[i].id], 'id repetido: ' + cs[i].id);
      vistos[cs[i].id] = true;
      ok(typeof cs[i].nome === 'string' && cs[i].nome.length > 0, 'nome ausente');
    }
    return cs.map(function (c) { return c.id; }).join(', ');
  });

  teste('Curvas', 'Toda curva é fechada: z(0) = z(2π)', function () {
    var pior = 0, quem = '';
    todasCurvas().forEach(function (c) {
      var a = c.param(0), b = c.param(TAU);
      var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      num(d);
      if (d > pior) { pior = d; quem = c.nome; }
    });
    abaixo(pior, 1e-12, 'maior descontinuidade no fechamento (' + quem + ')');
    return 'maior salto no fechamento: ' + fmt(pior);
  });

  teste('Curvas', 'Superelipses satisfazem |x|^n + |y|^n = 1', function () {
    var out = [];
    [4, 10].forEach(function (n) {
      var p = global.Curvas.superelipse(n);
      var pior = 0;
      for (var i = 0; i < 997; i++) {
        var q = p(TAU * i / 997);
        var v = Math.pow(Math.abs(q[0]), n) + Math.pow(Math.abs(q[1]), n);
        pior = Math.max(pior, Math.abs(v - 1));
      }
      abaixo(pior, TOL.algebrico, 'Fermat n=' + n);
      out.push('n=' + n + ': ' + fmt(pior));
    });
    return 'desvio máximo — ' + out.join(', ');
  });

  teste('Curvas', 'Lemniscata satisfaz (x²+y²)² = x² − y²', function () {
    var c = global.Curvas.porId('lemniscata');
    var pior = 0;
    for (var i = 0; i < 997; i++) {
      var q = c.param(TAU * i / 997);
      var r = q[0] * q[0] + q[1] * q[1];
      pior = Math.max(pior, Math.abs(r * r - (q[0] * q[0] - q[1] * q[1])));
    }
    abaixo(pior, TOL.algebrico, 'lemniscata');
    return 'desvio máximo: ' + fmt(pior);
  });

  teste('Curvas', 'Cúbica nodal satisfaz y² = x²(x+1) e passa duas vezes na origem', function () {
    var c = global.Curvas.porId('cubica-nodal');
    var pior = 0;
    for (var i = 0; i < 997; i++) {
      var q = c.param(TAU * i / 997);
      pior = Math.max(pior, Math.abs(q[1] * q[1] - q[0] * q[0] * (q[0] + 1)));
    }
    abaixo(pior, TOL.algebrico, 'cúbica nodal');
    var a = c.param(0), b = c.param(TAU), meio = c.param(Math.PI);
    abaixo(Math.hypot(a[0], a[1]), 1e-12, 'z(0) na origem');
    abaixo(Math.hypot(b[0], b[1]), 1e-12, 'z(2π) na origem');
    ok(Math.hypot(meio[0] + 1, meio[1]) < 1e-12, 'z(π) deveria ser (−1, 0)');
    return 'desvio máximo na equação: ' + fmt(pior);
  });

  // =========================================================================
  // 2. Reparametrização por comprimento de arco
  // =========================================================================

  teste('Arco', 'Espaçamento em arco é constante nas seis curvas', function () {
    var out = [];
    todasCurvas().forEach(function (c) {
      var r = global.Curvas.reamostrarPorArco(c, 512, 6000);
      var d = comprimentosEntrePontos(c, r.s);
      var cv = dispersaoRelativa(d);
      num(cv);
      abaixo(cv, TOL.arco, 'dispersão do espaçamento em ' + c.nome);
      out.push(c.nome + ': ' + fmt(cv));
    });
    return 'dispersão relativa — ' + out.join('; ');
  });

  teste('Arco', 'Reparametrizar melhora a uniformidade em toda curva de velocidade variável',
    function () {
      var out = [];
      todasCurvas().forEach(function (c) {
        if (c.id === 'circulo') return;      // já é uniforme por parâmetro
        var comArco = comprimentosEntrePontos(c, global.Curvas.reamostrarPorArco(c, 512, 6000).s);
        var semArco = comprimentosEntrePontos(c, global.Curvas.reamostrarPorParametro(c, 512).s);
        var a = dispersaoRelativa(comArco), b = dispersaoRelativa(semArco);
        ok(a < b, c.nome + ': arco (' + fmt(a) + ') não ficou melhor que parâmetro (' + fmt(b) + ')');
        out.push(c.nome + ': ' + fmt(b) + ' → ' + fmt(a));
      });
      return out.join('; ');
    });

  teste('Arco', 'Comprimentos conhecidos: círculo 2π e astroide 6', function () {
    var lc = malhaFina('circulo').total;
    var la = malhaFina('astroide').total;
    aprox(lc, TAU, 1e-6, 'comprimento do círculo');
    aprox(la, 6, 1e-6, 'comprimento da astroide');
    return 'círculo: ' + fmt(lc) + ' (2π = ' + fmt(TAU) + '), astroide: ' + fmt(la);
  });

  teste('Arco', 'A malha adaptativa atinge o alvo dentro do orçamento padrão', function () {
    var out = [];
    todasCurvas().forEach(function (c) {
      var t = global.Curvas.amostrarDenso(c, 6000);
      ok(!t.saturou, c.nome + ': estourou maxPontos/maxPassos com os limites padrão');
      out.push(c.nome + ': ' + t.pontos + (t.limitePrecisao ? ' (piso de precisão)' : ''));
    });
    return 'pontos da malha densa — ' + out.join('; ');
  });

  // =========================================================================
  // 3. DFT e Parseval
  // =========================================================================

  teste('Fourier', 'A DFT é invertível: soma com todos os termos reproduz as amostras',
    function () {
      var pior = 0;
      ['circulo', 'astroide', 'cubica-nodal'].forEach(function (id) {
        var r = coefDe(id, true);
        var N = r.am.N;
        for (var k = 0; k < N; k += 7) {
          var v = global.Fourier.avaliarParcial(r.coef, N / 2, TAU * k / N);
          pior = Math.max(pior, Math.hypot(v.re - r.am.re[k], v.im - r.am.im[k]));
        }
      });
      abaixo(pior, TOL.inversao, 'erro máximo de reconstrução');
      return 'erro máximo: ' + fmt(pior);
    });

  teste('Fourier', 'Parseval fecha: (1/N)Σ|z_k|² = Σ|f̂(n)|²', function () {
    var pior = 0, quem = '';
    var alvos = [];
    todasCurvas().forEach(function (c) {
      alvos.push({ nome: c.nome + ' (arco)', r: coefDe(c, true) });
      alvos.push({ nome: c.nome + ' (parâmetro)', r: coefDe(c, false) });
    });
    // sinal pseudoaleatório, para não testar só curvas suaves
    var N = 512, re = new Float64Array(N), im = new Float64Array(N), semente = 12345;
    for (var k = 0; k < N; k++) {
      semente = (1103515245 * semente + 12345) % 2147483648;
      re[k] = semente / 2147483648 - 0.5;
      semente = (1103515245 * semente + 12345) % 2147483648;
      im[k] = semente / 2147483648 - 0.5;
    }
    alvos.push({ nome: 'ruído', r: { am: { N: N, re: re, im: im }, coef: global.Fourier.dft(re, im) } });

    alvos.forEach(function (a) {
      var am = a.r.am, esq = 0;
      for (var i = 0; i < am.N; i++) esq += am.re[i] * am.re[i] + am.im[i] * am.im[i];
      esq /= am.N;
      var dir = global.Fourier.energia(a.r.coef);
      num(esq); num(dir);
      var rel = Math.abs(esq - dir) / Math.max(dir, 1e-300);
      if (rel > pior) { pior = rel; quem = a.nome; }
    });
    abaixo(pior, TOL.parseval, 'erro relativo de Parseval (pior caso: ' + quem + ')');
    return 'pior erro relativo: ' + fmt(pior) + ' (' + quem + ')';
  });

  teste('Fourier', 'Círculo: f̂(1) = 1 e todos os outros coeficientes são nulos', function () {
    var out = [];
    [true, false].forEach(function (arco) {
      var r = coefDe('circulo', arco);
      var c1 = global.Fourier.coeficiente(r.coef, 1);
      aprox(c1.re, 1, TOL.zeroEspectral, 'Re f̂(1)');
      aprox(c1.im, 0, TOL.zeroEspectral, 'Im f̂(1)');
      var pior = 0, piorN = 0;
      for (var j = 0; j < r.coef.N; j++) {
        if (r.coef.freq[j] === 1) continue;
        if (r.coef.mag[j] > pior) { pior = r.coef.mag[j]; piorN = r.coef.freq[j]; }
      }
      abaixo(pior, TOL.zeroEspectral, 'maior coeficiente espúrio (n = ' + piorN + ')');
      out.push((arco ? 'com arco' : 'sem arco') + ': maior espúrio ' + fmt(pior));
    });
    return out.join('; ');
  });

  teste('Fourier', 'Círculo com 1 termo: erro de Parseval nulo e "espectro finito"', function () {
    var r = coefDe('circulo', true);
    var err = global.Fourier.erroParseval(r.coef, 1);
    abaixo(err, 1e-12, 'erro de Parseval em M = 1');
    ok(!Object.is(err, -0), 'erro devolveu −0');
    var aj = global.Fourier.ajusteLogLog(r.coef);
    ok(aj.ok === false && aj.motivo === 'espectro finito',
       'esperava "espectro finito", veio ' + JSON.stringify(aj));
    return 'err(1) = ' + fmt(err) + ', ajuste: ' + aj.motivo + ' (' + aj.pontos + ' pontos válidos)';
  });

  teste('Fourier', 'err(M) é não-crescente e zera em M = N/2', function () {
    var out = [];
    todasCurvas().forEach(function (c) {
      var r = coefDe(c, true);
      var ant = Infinity;
      for (var M = 0; M <= 60; M++) {
        var e = global.Fourier.erroParseval(r.coef, M);
        num(e);
        ok(e <= ant + 1e-15, c.nome + ': err(' + M + ') = ' + fmt(e) + ' > err(' + (M - 1) + ')');
        ant = e;
      }
      var fim = global.Fourier.erroParseval(r.coef, r.coef.N / 2);
      abaixo(fim, 1e-15, c.nome + ': err(N/2)');
      out.push(c.nome + ': err(10) = ' + (100 * global.Fourier.erroParseval(r.coef, 10)).toFixed(2) + '%');
    });
    return out.join('; ');
  });

  // =========================================================================
  // 4. Decaimento — o argumento central do módulo 1
  // =========================================================================

  teste('Decaimento', 'Astroide decai claramente mais devagar que a lemniscata', function () {
    var lem = global.Fourier.ajusteLogLog(coefDe('lemniscata', true).coef);
    var ast = global.Fourier.ajusteLogLog(coefDe('astroide', true).coef);
    ok(lem.ok, 'lemniscata: ' + lem.motivo);
    ok(ast.ok, 'astroide: ' + ast.motivo);
    ok(ast.expoente > lem.expoente + 1,
       'diferença pequena demais: astroide ' + fmt(ast.expoente) + ' vs lemniscata ' + fmt(lem.expoente));
    return 'expoente — lemniscata: ' + lem.expoente.toFixed(2) +
           ' / astroide: ' + ast.expoente.toFixed(2) +
           ' (diferença de ' + (ast.expoente - lem.expoente).toFixed(2) + ')';
  });

  /* Na cúspide da astroide a tangente se INVERTE: em arco, x ≈ 1 − |σ| perto do
   * ponto singular. É um bico, não uma cúspide suave — logo n^{-2}, e não o
   * n^{-5/2} que o termo y ~ σ^{3/2} sozinho sugeriria. O termo em σ^{3/2} é a
   * correção subdominante, e é ela que explica o expoente medido ficar um pouco
   * acima de −2 numa faixa finita de n. */
  teste('Decaimento', 'Astroide: o bico em arco dá decaimento n^{-2}', function () {
    var aj = global.Fourier.ajusteLogLog(coefDe('astroide', true).coef);
    ok(aj.ok, 'esperava ajuste válido, veio "' + aj.motivo + '"');
    aprox(aj.expoente, -2, 0.2, 'expoente da astroide');
    ok(aj.r2 > 0.99, 'R² baixo demais para uma lei de potência: ' + fmt(aj.r2));
    // n²|f̂(n)| tem que estabilizar se o decaimento é mesmo n^{-2}
    var co = coefDe('astroide', true).coef;
    var v = [15, 23, 31, 47, 63].map(function (n) {
      var m = Math.max(global.Fourier.coeficiente(co, n).mag,
                       global.Fourier.coeficiente(co, -n).mag);
      return n * n * m;
    });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    ok(hi / lo < 1.15, 'n²|f̂(n)| não estabilizou: ' + fmt(lo) + ' … ' + fmt(hi));
    return 'expoente ' + aj.expoente.toFixed(3) + ' (R² ' + aj.r2.toFixed(4) +
           '), n²|f̂(n)| ∈ [' + lo.toFixed(3) + ', ' + hi.toFixed(3) + ']';
  });

  /* z(σ + L/4) = i·z(σ) força f̂(n) = 0 salvo n ≡ 1 (mod 4). Vale só na
   * parametrização por arco — é um teste de que a reamostragem respeita a
   * simetria da curva, e não apenas de que ela devolve números plausíveis. */
  teste('Decaimento', 'Astroide em arco: simetria de ordem 4 zera todo n ≢ 1 (mod 4)',
    function () {
      var co = coefDe('astroide', true).coef;
      var piorFora = 0, foraN = 0, menorDentro = Infinity;
      for (var j = 0; j < co.N; j++) {
        var n = co.freq[j];
        if ((((n % 4) + 4) % 4) === 1) {
          if (Math.abs(n) <= 48 && co.mag[j] < menorDentro) menorDentro = co.mag[j];
        } else if (co.mag[j] > piorFora) { piorFora = co.mag[j]; foraN = n; }
      }
      abaixo(piorFora, 1e-12, 'maior coeficiente fora de n ≡ 1 mod 4 (n = ' + foraN + ')');
      ok(menorDentro > 1e-6, 'os coeficientes permitidos deveriam ser não nulos');
      return 'maior proibido: ' + fmt(piorFora) + ' / menor permitido (|n| ≤ 48): ' + fmt(menorDentro);
    });

  teste('Decaimento', 'Desligar a reparametrização muda o resultado de forma visível',
    function () {
      var out = [];
      todasCurvas().forEach(function (c) {
        var a = global.Fourier.ajusteLogLog(coefDe(c, true).coef);
        var b = global.Fourier.ajusteLogLog(coefDe(c, false).coef);
        var da = a.ok ? a.expoente.toFixed(2) : a.motivo;
        var db = b.ok ? b.expoente.toFixed(2) : b.motivo;
        out.push(c.nome + ': ' + da + ' → ' + db);
      });
      // A astroide é o caso didático: em s ela é exatamente (3/4)e^{is} + (1/4)e^{-3is}.
      var semArco = global.Fourier.ajusteLogLog(coefDe('astroide', false).coef);
      ok(semArco.ok === false,
         'sem arco a astroide deveria ter espectro finito, veio expoente ' + fmt(semArco.expoente));
      var r = coefDe('astroide', false);
      var pior = 0;
      for (var j = 0; j < r.coef.N; j++) {
        var n = r.coef.freq[j];
        if (n === 1 || n === -3) continue;
        pior = Math.max(pior, r.coef.mag[j]);
      }
      abaixo(pior, 1e-12, 'astroide sem arco tem coeficiente fora de {1, −3}');
      aprox(global.Fourier.coeficiente(r.coef, 1).mag, 0.75, 1e-12, '|f̂(1)| da astroide');
      aprox(global.Fourier.coeficiente(r.coef, -3).mag, 0.25, 1e-12, '|f̂(−3)| da astroide');
      return 'com arco → sem arco: ' + out.join('; ');
    });

  /* Curvas analíticas decaem como e^{-cn}, não como n^{-α}. Ajustar uma reta em
   * log-log sobre isso produz um "expoente" que não descreve nada — é o erro
   * que a comparação de modelos existe para evitar. */
  teste('Decaimento', 'Lemniscata: o modelo exponencial vence o de potência', function () {
    var cl = global.Fourier.classificarDecaimento(coefDe('lemniscata', true).coef);
    ok(cl.modelo === 'exponencial',
       'esperava exponencial, veio "' + cl.modelo + '"');
    ok(cl.exponencial.r2 > cl.potencia.r2 + cl.margem,
       'R² exponencial não superou o de potência com folga');
    ok(cl.exponencial.r2 > 0.99, 'R² exponencial baixo: ' + fmt(cl.exponencial.r2));
    return 'R² — potência ' + cl.potencia.r2.toFixed(4) +
           ' vs exponencial ' + cl.exponencial.r2.toFixed(4);
  });

  teste('Decaimento', 'Astroide e cúbica nodal: o modelo de potência vence', function () {
    var out = [];
    ['astroide', 'cubica-nodal'].forEach(function (id) {
      var cl = global.Fourier.classificarDecaimento(coefDe(id, true).coef);
      ok(cl.modelo === 'potencia', id + ': esperava potência, veio "' + cl.modelo + '"');
      ok(cl.potencia.r2 > cl.exponencial.r2 + cl.margem, id + ': vitória sem folga');
      out.push(id + ': ' + cl.potencia.r2.toFixed(4) + ' vs ' + cl.exponencial.r2.toFixed(4));
    });
    return 'R² potência vs exponencial — ' + out.join('; ');
  });

  teste('Decaimento', 'Toda curva declara previsão teórica, e a medida não a contradiz',
    function () {
      var out = [];
      todasCurvas().forEach(function (c) {
        ok(c.previsto && c.previsto.modelo && c.previsto.rotulo && c.previsto.razao,
           c.nome + ': previsão ausente ou incompleta');
        var cl = global.Fourier.classificarDecaimento(coefDe(c, true).coef);
        // "indeciso" não é contradição: é a faixa finita não decidindo
        ok(cl.modelo === c.previsto.modelo || cl.modelo === 'indeciso',
           c.nome + ': previsto "' + c.previsto.modelo + '", medido "' + cl.modelo + '"');
        out.push(c.nome + ': ' + c.previsto.modelo +
                 (cl.modelo === c.previsto.modelo ? ' ✓' : ' (indeciso)'));
      });
      return out.join('; ');
    });

  teste('Decaimento', 'Curvas com bico medem expoente próximo de −2', function () {
    var out = [];
    todasCurvas().forEach(function (c) {
      if (!c.previsto.expoente) return;
      var aj = global.Fourier.ajusteLogLog(coefDe(c, true).coef);
      ok(aj.ok, c.nome + ': esperava ajuste válido');
      aprox(aj.expoente, c.previsto.expoente, 0.2,
            c.nome + ': medido vs previsto');
      out.push(c.nome + ': previsto ' + c.previsto.expoente +
               ', medido ' + aj.expoente.toFixed(3));
    });
    ok(out.length === 2, 'esperava 2 curvas com expoente previsto, achei ' + out.length);
    return out.join('; ');
  });

  teste('Decaimento', 'O ajuste semi-log recupera uma exponencial sintética', function () {
    // espectro fabricado com |f̂(n)| = A·e^{-cn}: o ajuste tem que devolver c
    var N = 512, re = new Float64Array(N), im = new Float64Array(N);
    var c = 0.35, A = 0.4;
    var F = global.Fourier;
    for (var j = 0; j < N; j++) {
      var n = j - N / 2;
      var mag = A * Math.exp(-c * Math.abs(n));
      re[j] = mag; im[j] = 0;
    }
    var falso = { N: N, freq: new Int32Array(N), re: re, im: im, mag: new Float64Array(N) };
    for (j = 0; j < N; j++) { falso.freq[j] = j - N / 2; falso.mag[j] = Math.abs(re[j]); }

    var exp = F.ajusteSemiLog(falso);
    ok(exp.ok, 'esperava ajuste válido');
    aprox(exp.taxa, -c, 1e-9, 'taxa recuperada');
    aprox(exp.r2, 1, 1e-9, 'R² de um ajuste exato');
    var cl = F.classificarDecaimento(falso);
    ok(cl.modelo === 'exponencial', 'classificou como "' + cl.modelo + '"');
    return 'taxa ' + exp.taxa.toFixed(6) + ' (esperado ' + (-c) + '), R² ' + exp.r2.toFixed(9);
  });

  teste('Decaimento', 'O ajuste log-log recupera uma lei de potência sintética', function () {
    var N = 512, re = new Float64Array(N), im = new Float64Array(N);
    var alfa = -2.5, F = global.Fourier;
    for (var j = 0; j < N; j++) {
      var n = Math.abs(j - N / 2);
      re[j] = n === 0 ? 1 : Math.pow(n, alfa);
      im[j] = 0;
    }
    var falso = { N: N, freq: new Int32Array(N), re: re, im: im, mag: new Float64Array(N) };
    for (j = 0; j < N; j++) { falso.freq[j] = j - N / 2; falso.mag[j] = re[j]; }

    var pot = F.ajusteLogLog(falso);
    ok(pot.ok, 'esperava ajuste válido');
    aprox(pot.expoente, alfa, 1e-9, 'expoente recuperado');
    aprox(pot.r2, 1, 1e-9, 'R² de um ajuste exato');
    var cl = F.classificarDecaimento(falso);
    ok(cl.modelo === 'potencia', 'classificou como "' + cl.modelo + '"');
    return 'expoente ' + pot.expoente.toFixed(6) + ' (esperado ' + alfa + '), R² ' + pot.r2.toFixed(9);
  });

  // =========================================================================
  // 5. Higiene numérica (critérios de aceite 7 e 8)
  // =========================================================================

  teste('Higiene', 'Nenhum NaN, Infinity ou −0 em nenhuma combinação de controles',
    function () {
      var contados = 0;
      todasCurvas().forEach(function (c) {
        [true, false].forEach(function (arco) {
          var r = coefDe(c, arco);
          for (var j = 0; j < r.coef.N; j++) {
            num(r.coef.re[j]); num(r.coef.im[j]); num(r.coef.mag[j]);
            ok(!Object.is(r.coef.mag[j], -0), 'módulo −0 em n = ' + r.coef.freq[j]);
            contados += 3;
          }
          for (var M = 1; M <= 60; M++) {
            num(global.Fourier.erroParseval(r.coef, M));
            var t = global.Fourier.termosPorModulo(r.coef, M);
            ok(t.length === Math.min(2 * M + 1, r.coef.N), 'contagem de termos errada em M = ' + M);
            contados += 1;
          }
          var aj = global.Fourier.ajusteLogLog(r.coef);
          if (aj.ok) { num(aj.expoente); num(aj.intercepto); num(aj.r2); }
          contados += 1;
        });
      });
      return contados.toLocaleString('pt-BR') + ' valores verificados';
    });

  teste('Higiene', 'Termos ordenados por módulo decrescente, sem alterar o conjunto |n| ≤ M',
    function () {
      var r = coefDe('fermat10', true);
      var M = 12;
      var t = global.Fourier.termosPorModulo(r.coef, M);
      ok(t.length === 2 * M + 1, 'esperava ' + (2 * M + 1) + ' termos, veio ' + t.length);
      for (var i = 1; i < t.length; i++) {
        ok(t[i - 1].mag >= t[i].mag, 'ordem quebrada em i = ' + i);
      }
      var vistos = {};
      t.forEach(function (x) {
        ok(Math.abs(x.n) <= M, 'termo fora da faixa: n = ' + x.n);
        ok(!vistos[x.n], 'termo repetido: n = ' + x.n);
        vistos[x.n] = true;
      });
      return 'M = ' + M + ' → ' + t.length + ' termos, maior |f̂| em n = ' + t[0].n;
    });

  // =========================================================================
  // 6. Módulo 2 — ondas triangular e quadrada
  // =========================================================================

  teste('Ondas', 'Si(π) por quadratura bate com o valor conhecido', function () {
    aprox(global.Ondas.SI_PI, 1.851937051982, 1e-10, 'Si(π)');
    return 'Si(π) = ' + global.Ondas.SI_PI.toFixed(12);
  });

  teste('Ondas', 'Limite de Gibbs: 0,2811 para um salto de altura π (8,95%)', function () {
    aprox(global.Ondas.GIBBS, 0.281140725187, 1e-10, 'Si(π) − π/2');
    aprox(global.Ondas.GIBBS_FRACAO, 0.0894898722, 1e-9, 'fração do salto');
    return 'limite ' + global.Ondas.GIBBS.toFixed(6) + ' = ' +
           (100 * global.Ondas.GIBBS_FRACAO).toFixed(3) + '% do salto π';
  });

  teste('Ondas', 'As séries reproduzem f longe das descontinuidades', function () {
    var T = global.Ondas.triangular, Q = global.Ondas.quadrada;
    var piorT = 0, piorQ = 0;
    for (var i = 1; i < 200; i++) {
      var x = -1 + 2 * i / 200;
      if (Math.abs(x) > 0.02 && Math.abs(Math.abs(x) - 1) > 0.02) {
        piorT = Math.max(piorT, Math.abs(T.f(x) - T.S(x, 4000)));
      }
      var y = -PI_TESTE + 2 * PI_TESTE * i / 200;
      if (Math.abs(y) > 0.05 && Math.abs(Math.abs(y) - PI_TESTE) > 0.05) {
        piorQ = Math.max(piorQ, Math.abs(Q.f(y) - Q.S(y, 4000)));
      }
    }
    abaixo(piorT, 1e-4, 'triangular com N = 4000');
    abaixo(piorQ, 2e-2, 'quadrada com N = 4000, fora do salto');
    return 'triangular: ' + fmt(piorT) + '; quadrada (fora do salto): ' + fmt(piorQ);
  });

  teste('Ondas', 'Extensão periódica correta: período 2 e período 2π', function () {
    var T = global.Ondas.triangular, Q = global.Ondas.quadrada;
    for (var i = 0; i < 50; i++) {
      var x = -3 + 6 * i / 50;
      aprox(T.f(x), T.f(x + 2), 1e-15, 'triangular 2-periódica em x = ' + fmt(x));
      aprox(Q.f(x), Q.f(x + 2 * PI_TESTE), 1e-15, 'quadrada 2π-periódica em x = ' + fmt(x));
    }
    aprox(T.f(0), 0, 0, 'f(0) da triangular');
    aprox(T.f(1), 1, 0, 'f(1) da triangular');
    aprox(Q.f(0), PI_TESTE, 0, 'f(0) da quadrada (χ inclui 0)');
    aprox(Q.f(PI_TESTE), 0, 0, 'f(π) da quadrada (χ exclui π)');
    aprox(Q.f(-0.001), 0, 0, 'f(0⁻) da quadrada');
    return 'f(0)=0 e f(1)=1 na triangular; f(0)=π e f(π)=0 na quadrada';
  });

  teste('Ondas', 'Triangular: o erro máximo em forma fechada bate com a varredura',
    function () {
      var T = global.Ondas.triangular;
      var pior = 0;
      [1, 2, 5, 12, 40].forEach(function (N) {
        var varrido = 0;
        for (var i = 0; i <= 4000; i++) {
          var x = -1 + 2 * i / 4000;
          varrido = Math.max(varrido, Math.abs(T.f(x) - T.S(x, N)));
        }
        pior = Math.max(pior, Math.abs(varrido - T.supErro(N)) / T.supErro(N));
      });
      abaixo(pior, 1e-6, 'discrepância relativa entre fórmula fechada e varredura');
      return 'erro relativo máximo: ' + fmt(pior) +
             '; supErro(1) = ' + T.supErro(1).toFixed(6) +
             ', supErro(200) = ' + T.supErro(200).toExponential(3);
    });

  teste('Ondas', 'Triangular: o erro máximo cai a zero (critério de aceite 5)', function () {
    var T = global.Ondas.triangular;
    var ant = Infinity;
    for (var N = 1; N <= 200; N++) {
      var e = T.supErro(N);
      num(e);
      ok(e < ant, 'supErro não decresceu em N = ' + N);
      ant = e;
    }
    abaixo(T.supErro(200), 1e-3, 'erro em N = 200');
    // decai como ~1/(4N)·(4/π²)
    aprox(T.supErro(200) * 200, 0.1013, 5e-3, 'N·supErro(N) tende a 1/π²·... ');
    return 'N=1: ' + T.supErro(1).toFixed(6) + ' → N=200: ' + T.supErro(200).toExponential(3);
  });

  teste('Ondas', 'Quadrada: ‖f − S_N‖∞ = π/2 exatamente, para todo N', function () {
    var Q = global.Ondas.quadrada;
    var pior = 0;
    [1, 3, 10, 50, 200].forEach(function (N) {
      // varredura incluindo explicitamente os pontos de salto
      var varrido = Math.abs(Q.f(0) - Q.S(0, N));
      for (var i = 0; i <= 6000; i++) {
        var x = -PI_TESTE + 2 * PI_TESTE * i / 6000;
        varrido = Math.max(varrido, Math.abs(Q.f(x) - Q.S(x, N)));
      }
      pior = Math.max(pior, Math.abs(varrido - PI_TESTE / 2));
      aprox(Q.supErro(N), PI_TESTE / 2, 0, 'supErro(' + N + ')');
    });
    abaixo(pior, 1e-9, 'varredura vs π/2');
    return 'π/2 = ' + (PI_TESTE / 2).toFixed(6) + ', constante em N; varredura confere em ' + fmt(pior);
  });

  /* S_N(π/(2N)) − π/2 é a regra do ponto médio com N intervalos para
   * ∫_0^π (sin t)/t dt. A regra superestima aqui, então o overshoot desce até o
   * limite POR CIMA — nunca cruza para baixo e nunca tende a zero. */
  teste('Ondas', 'Quadrada: o overshoot estaciona em 0,281 (critério de aceite 5)', function () {
    var Q = global.Ondas.quadrada, G = global.Ondas.GIBBS;
    var g200 = Q.overshoot(200);
    aprox(g200, G, 1e-4, 'overshoot em N = 200');
    var ant = Infinity;
    for (var N = 1; N <= 200; N++) {
      var g = Q.overshoot(N);
      num(g);
      ok(g < ant, 'overshoot não decresceu em N = ' + N);
      ok(g > G, 'overshoot furou o limite por baixo em N = ' + N + ': ' + fmt(g));
      ant = g;
    }
    // o ponto do critério de aceite: estaciona, não vai a zero
    ok(g200 > 0.28, 'overshoot deveria estacionar perto de 0,281, veio ' + fmt(g200));
    ok(Q.overshoot(200) / Q.overshoot(20) > 0.9, 'entre N=20 e N=200 mal deveria mudar');
    return 'N=1: ' + Q.overshoot(1).toFixed(6) + ' → N=20: ' + Q.overshoot(20).toFixed(6) +
           ' → N=200: ' + g200.toFixed(6) + ' (limite ' + G.toFixed(6) +
           ', excesso ' + (g200 - G).toExponential(2) + ')';
  });

  teste('Ondas', 'Quadrada: o pico de Gibbs migra para o salto sem encolher', function () {
    var Q = global.Ondas.quadrada;
    var out = [];
    [5, 20, 200].forEach(function (N) {
      var x = Q.argOvershoot(N);
      // é mesmo máximo local: S_N cresce antes e decresce depois
      ok(Q.S(x, N) > Q.S(x * 0.9, N), 'não é máximo à esquerda, N = ' + N);
      ok(Q.S(x, N) > Q.S(x * 1.1, N), 'não é máximo à direita, N = ' + N);
      out.push('N=' + N + ': x* = ' + x.toFixed(5));
    });
    ok(Q.argOvershoot(200) < Q.argOvershoot(5), 'o pico deveria se aproximar do salto');
    return out.join('; ');
  });

  teste('Ondas', 'As três identidades convergem para os valores corretos (aceite 6)',
    function () {
      var out = [];
      global.Ondas.identidades.forEach(function (idt) {
        var p1 = idt.parcial(1), p200 = idt.parcial(200), p20000 = idt.parcial(20000);
        num(p1); num(p200); num(p20000);
        ok(Math.abs(p20000 - idt.exato) < Math.abs(p200 - idt.exato),
           idt.id + ': não melhorou de N=200 para N=20000');
        abaixo(Math.abs(p20000 - idt.exato), 1e-4, idt.id + ' em N = 20000');
        out.push(idt.id + ': ' + p200.toFixed(8) + ' vs ' + idt.exato.toFixed(8));
      });
      return out.join('; ');
    });

  teste('Ondas', 'Nenhum NaN ou Infinity em nenhum N do intervalo do slider', function () {
    var T = global.Ondas.triangular, Q = global.Ondas.quadrada, c = 0;
    for (var N = 1; N <= 200; N++) {
      num(T.supErro(N)); num(Q.supErro(N)); num(Q.overshoot(N)); c += 3;
      for (var i = 0; i <= 40; i++) {
        num(T.S(-1 + 2 * i / 40, N));
        num(Q.S(-PI_TESTE + 2 * PI_TESTE * i / 40, N));
        c += 2;
      }
      global.Ondas.identidades.forEach(function (idt) { num(idt.parcial(N)); c++; });
    }
    return c.toLocaleString('pt-BR') + ' valores verificados';
  });

  // ---- execução ------------------------------------------------------------
  function executar() {
    return casos.map(function (c) {
      var t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      try {
        var detalhe = c.fn();
        return { grupo: c.grupo, nome: c.nome, ok: true, detalhe: detalhe || '',
                 ms: ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - t0 };
      } catch (e) {
        return { grupo: c.grupo, nome: c.nome, ok: false, detalhe: e && e.message ? e.message : String(e),
                 ms: ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - t0 };
      }
    });
  }

  global.Testes = { executar: executar, total: casos.length, TOL: TOL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
