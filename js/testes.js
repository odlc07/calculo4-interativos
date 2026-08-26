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

  // =========================================================================
  // 7. Módulo 4 — recorrência, função geratriz e raio de convergência
  // =========================================================================

  /* Os dois casos vêm de questões de prova e precisam sair exatos. Se estes
   * falharem, o módulo está errado — nenhuma interface conserta isso. */
  var CASOS_PROVA = [
    { nome: 'seqrecursiva (P2)', alfa: [1, 1], c: [1, 2],
      P: [1], Q: [1, -1, -2], raizes: [0.5, -1], R: 0.5, taxa: 2 },
    { nome: 'seqrecursiva-2 (pré-P)', alfa: [1, 1], c: [2, 3],
      P: [1, -1], Q: [1, -2, -3], raizes: [1 / 3, -1], R: 1 / 3, taxa: 3 }
  ];

  function vetorAprox(obtido, esperado, tol, rotulo) {
    ok(obtido.length === esperado.length,
       rotulo + ': esperava ' + esperado.length + ' entradas, veio ' + obtido.length +
       ' (' + obtido.join(', ') + ')');
    for (var i = 0; i < esperado.length; i++) {
      aprox(obtido[i], esperado[i], tol, rotulo + '[' + i + ']');
    }
  }

  teste('Geratriz', 'Os dois casos de prova saem exatos', function () {
    var out = [];
    CASOS_PROVA.forEach(function (caso) {
      var a = global.Polinomios.analisar(caso.alfa, caso.c, 40);
      vetorAprox(a.P, caso.P, 1e-12, caso.nome + ' — P');
      vetorAprox(a.Q, caso.Q, 1e-12, caso.nome + ' — Q');

      var mods = a.raizes.map(function (z) { return z.re; }).sort(function (x, y) { return x - y; });
      var esp = caso.raizes.slice().sort(function (x, y) { return x - y; });
      vetorAprox(mods, esp, 1e-12, caso.nome + ' — raízes');

      aprox(a.R, caso.R, 1e-12, caso.nome + ' — R');
      ok(a.dominante, caso.nome + ': deveria ter raiz dominante');
      out.push(caso.nome + ': R = ' + a.R.toFixed(6));
    });
    return out.join('; ');
  });

  teste('Geratriz', 'A razão αₙ₊₁/αₙ converge para 1/R nos casos de prova', function () {
    var out = [];
    CASOS_PROVA.forEach(function (caso) {
      var a = global.Polinomios.analisar(caso.alfa, caso.c, 55);
      var ultima = a.razoes[a.razoes.length - 1];
      num(ultima);
      aprox(ultima, caso.taxa, 1e-9, caso.nome + ' — razão final vs 1/R');
      aprox(a.taxa, caso.taxa, 1e-12, caso.nome + ' — 1/R');
      out.push(caso.nome + ': ' + ultima.toFixed(9) + ' → ' + caso.taxa);
    });
    return out.join('; ');
  });

  teste('Geratriz', 'BigInt mantém os termos exatos onde Number já estourou', function () {
    var a = global.Polinomios.analisar([1, 1], [1, 2], 60);
    ok(a.exatos, 'esperava termos em BigInt para entradas inteiras');
    // α_n satisfaz a recorrência exatamente, termo a termo
    for (var n = 2; n < a.exatos.length; n++) {
      var esperado = a.exatos[n - 1] + BigInt(2) * a.exatos[n - 2];
      ok(a.exatos[n] === esperado, 'recorrência quebrou em n = ' + n);
    }
    var grande = a.exatos[a.exatos.length - 1];
    ok(grande > BigInt(Number.MAX_SAFE_INTEGER),
       'o teste precisa passar de 2^53 para ter graça: ' + grande);
    // e a razão continua correta apesar do tamanho
    aprox(a.razoes[a.razoes.length - 1], 2, 1e-12, 'razão no fim da sequência');
    return 'α₆₀ = ' + grande.toString() + ' (' + grande.toString().length + ' dígitos)';
  });

  teste('Geratriz', 'Raízes complexas: Q = 1 + x² dá ±i, R = 1, sem raiz dominante',
    function () {
      var a = global.Polinomios.analisar([1, 1], [0, -1], 24);
      vetorAprox(a.Q, [1, 0, 1], 1e-12, 'Q');
      ok(a.raizes.length === 2, 'esperava 2 raízes');
      a.raizes.forEach(function (z) {
        abaixo(Math.abs(z.re), 1e-12, 'parte real de uma raiz de 1 + x²');
        aprox(Math.abs(z.im), 1, 1e-12, 'parte imaginária');
      });
      aprox(a.R, 1, 1e-12, 'R');
      ok(!a.dominante, 'módulos iguais deveriam desligar a raiz dominante');
      ok(a.motivo === 'modulos-iguais', 'motivo veio "' + a.motivo + '"');
      // a sequência é periódica e a razão oscila entre +1 e −1
      var vistos = {};
      a.razoes.forEach(function (r) { if (isFinite(r)) vistos[r.toFixed(6)] = true; });
      var chaves = Object.keys(vistos).sort();
      ok(chaves.length === 2, 'a razão deveria oscilar entre dois valores, veio ' + chaves.join(', '));
      return 'raízes ±i, R = 1, razão oscila entre ' + chaves.join(' e ');
    });

  teste('Geratriz', 'Fibonacci: R = 1/φ e a razão tende a φ', function () {
    var phi = (1 + Math.sqrt(5)) / 2;
    var a = global.Polinomios.analisar([1, 1], [1, 1], 55);
    vetorAprox(a.termos.slice(0, 8), [1, 1, 2, 3, 5, 8, 13, 21], 0, 'primeiros termos');
    aprox(a.R, 1 / phi, 1e-12, 'R');
    aprox(a.razoes[a.razoes.length - 1], phi, 1e-12, 'razão final');
    return 'R = ' + a.R.toFixed(9) + ' = 1/φ, razão → ' + phi.toFixed(9);
  });

  teste('Geratriz', 'Sem raízes, f é polinômio e R = ∞ em vez de divisão por zero',
    function () {
      var a = global.Polinomios.analisar([1, 1], [0, 0], 12);
      ok(a.raizes.length === 0, 'Q constante não deveria ter raízes');
      ok(a.R === Infinity, 'R deveria ser ∞, veio ' + fmt(a.R));
      ok(a.motivo === 'polinomio', 'motivo veio "' + a.motivo + '"');
      vetorAprox(a.termos.slice(0, 5), [1, 1, 0, 0, 0], 0, 'termos');
      return 'Q = ' + global.Polinomios.paraLatex(a.Q) + ', R = ∞';
    });

  teste('Geratriz', 'Grau 3 por Durand–Kerner devolve raízes de verdade', function () {
    // Q = 1 - c1x - c2x² - c3x³ com raízes conhecidas por construção
    var a = global.Polinomios.analisar([1, 0, 0], [0, 0, 1], 20);   // Q = 1 - x³
    ok(a.raizes.length === 3, 'esperava 3 raízes, veio ' + a.raizes.length);
    a.raizes.forEach(function (z, i) {
      aprox(global.Polinomios.cMod(z), 1, 1e-9, 'módulo da raiz ' + i + ' de 1 − x³');
    });
    aprox(a.R, 1, 1e-9, 'R');
    // cada raiz realmente anula Q
    var pior = 0;
    a.raizes.forEach(function (z) {
      // Q(z) = 1 - z³
      var z2 = { re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im };
      var z3 = { re: z2.re * z.re - z2.im * z.im, im: z2.re * z.im + z2.im * z.re };
      pior = Math.max(pior, Math.hypot(1 - z3.re, -z3.im));
    });
    abaixo(pior, 1e-9, 'resíduo |Q(z)| na pior raiz');
    return '3 raízes de módulo 1, resíduo máximo ' + fmt(pior);
  });

  teste('Geratriz', 'O LaTeX sai em ordem crescente, como o enunciado escreve', function () {
    var L = global.Polinomios.paraLatex;
    ok(L([1, -1, -2]) === '1 - x - 2x^{2}', 'veio "' + L([1, -1, -2]) + '"');
    ok(L([1, -1]) === '1 - x', 'veio "' + L([1, -1]) + '"');
    ok(L([1]) === '1', 'veio "' + L([1]) + '"');
    ok(L([0]) === '0', 'veio "' + L([0]) + '"');
    return '1 - x - 2x^{2}, 1 - x, 1, 0';
  });

  // =========================================================================
  // 8. Módulo 3 — iteração, pontos fixos e diagrama de teia
  // =========================================================================

  teste('Teia', 'Pontos fixos e classificação batem com os valores conhecidos', function () {
    var esperado = {
      raiz6: [{ x: 3, classe: 'atrator', dg: 1 / 6 }],
      cos: [{ x: 0.7390851332, classe: 'atrator', dg: -0.6736120292 }],
      quadrado: [{ x: 0, classe: 'atrator', dg: 0 }, { x: 1, classe: 'repulsor', dg: 2 }],
      logistica32: [{ x: 0, classe: 'repulsor', dg: 3.2 }, { x: 0.6875, classe: 'repulsor', dg: -1.2 }],
      logistica28: [{ x: 0, classe: 'repulsor', dg: 2.8 },
                    { x: 9 / 14, classe: 'atrator', dg: -0.8 }]
    };
    var out = [];
    global.Iteracao.FUNCOES.forEach(function (fn) {
      var esp = esperado[fn.id];
      ok(esp, 'sem expectativa registrada para ' + fn.id);
      var achados = global.Iteracao.pontosFixos(fn);
      ok(achados.length === esp.length,
         fn.rotulo + ': esperava ' + esp.length + ' pontos fixos, achei ' + achados.length +
         ' (' + achados.map(function (p) { return p.x.toFixed(4); }).join(', ') + ')');
      for (var i = 0; i < esp.length; i++) {
        aprox(achados[i].x, esp[i].x, 1e-8, fn.rotulo + ' — ponto fixo ' + i);
        aprox(achados[i].dg, esp[i].dg, 1e-7, fn.rotulo + ' — g′ no ponto ' + i);
        ok(achados[i].classe === esp[i].classe,
           fn.rotulo + ' — ponto ' + achados[i].x.toFixed(4) + ': esperava ' +
           esp[i].classe + ', veio ' + achados[i].classe);
      }
      out.push(fn.rotulo + ': ' + achados.map(function (p) {
        return p.x.toFixed(4) + ' (' + p.classe + ')';
      }).join(', '));
    });
    return out.join('; ');
  });

  teste('Teia', '|g′| = 1 é declarado inconclusivo, não chutado', function () {
    var C = global.Iteracao.classificar;
    ok(C(1) === 'inconclusivo', 'g′ = 1 veio ' + C(1));
    ok(C(-1) === 'inconclusivo', 'g′ = −1 veio ' + C(-1));
    ok(C(0.999999999999) === 'inconclusivo', 'quase 1 por baixo veio ' + C(0.999999999999));
    ok(C(0.99) === 'atrator', 'g′ = 0,99 veio ' + C(0.99));
    ok(C(1.01) === 'repulsor', 'g′ = 1,01 veio ' + C(1.01));
    ok(C(Infinity) === 'inconclusivo', 'g′ infinita veio ' + C(Infinity));
    return 'fronteira |g′| = 1 tratada como inconclusiva';
  });

  /* O ponto alto do módulo: −2 resolve a equação algébrica mas NÃO é ponto
   * fixo de g, porque a raiz quadrada é não negativa. */
  teste('Teia', '−2 é raiz da equação algébrica mas não é ponto fixo de √(6+x)',
    function () {
      var fn = global.Iteracao.porId('raiz6');
      var alg = fn.algebrica;
      ok(alg && alg.raizes.length === 2, 'faltou registrar as raízes algébricas');

      // as duas raízes realmente resolvem x² − x − 6 = 0
      alg.raizes.forEach(function (r) {
        abaixo(Math.abs(r * r - r - 6), 1e-12, 'x² − x − 6 em x = ' + r);
      });

      // mas só 3 satisfaz g(x) = x
      abaixo(Math.abs(fn.g(3) - 3), 1e-12, 'g(3) = 3');
      var g2 = fn.g(-2);
      aprox(g2, 2, 1e-12, 'g(−2)');
      ok(Math.abs(g2 - (-2)) > 1, 'g(−2) deveria estar longe de −2, veio ' + fmt(g2));

      // e −2 não aparece entre os pontos fixos encontrados numericamente
      var achados = global.Iteracao.pontosFixos(fn);
      achados.forEach(function (p) {
        ok(Math.abs(p.x - (-2)) > 1e-3, '−2 apareceu como ponto fixo');
      });
      ok(alg.espurias.length === 1 && alg.espurias[0] === -2, 'faltou marcar −2 como espúria');
      return 'g(−2) = ' + g2 + ' ≠ −2; pontos fixos achados: ' +
             achados.map(function (p) { return p.x.toFixed(6); }).join(', ');
    });

  teste('Teia', '√(6+x): todo a₀ do domínio converge para 3 (critério de aceite 2)',
    function () {
      var fn = global.Iteracao.porId('raiz6');
      var testados = 0, pior = 0;
      for (var i = 0; i <= 60; i++) {
        var a0 = -5.999 + (500 - (-5.999)) * i / 60;
        var o = global.Iteracao.orbita(fn, a0, 200);
        ok(o.parada !== 'escape', 'a₀ = ' + fmt(a0) + ' escapou');
        var fim = o.valores[o.valores.length - 1];
        num(fim);
        pior = Math.max(pior, Math.abs(fim - 3));
        testados++;
      }
      abaixo(pior, 1e-6, 'maior distância até 3 no fim da órbita');
      return testados + ' valores iniciais, de −5,999 a 500; pior desvio de 3: ' + fmt(pior);
    });

  teste('Teia', 'a₀ < −6 devolve mensagem de domínio, não NaN (critério de aceite 2)',
    function () {
      var fn = global.Iteracao.porId('raiz6');
      var out = [];
      [-6, -6.5, -100, -1e9].forEach(function (a0) {
        var o = global.Iteracao.orbita(fn, a0, 20);
        ok(o.parada === 'dominio', 'a₀ = ' + a0 + ': parada veio "' + o.parada + '"');
        ok(o.mensagem.length > 0, 'faltou mensagem para a₀ = ' + a0);
        o.valores.forEach(function (v) { num(v); });
        out.push(String(a0));
      });
      return 'a₀ ∈ {' + out.join(', ') + '} → "' +
             global.Iteracao.orbita(fn, -7, 5).mensagem + '"';
    });

  teste('Teia', 'x²: o destino depende de a₀, e a divergência é detectada', function () {
    var fn = global.Iteracao.porId('quadrado');
    var dentro = global.Iteracao.orbita(fn, 0.9, 400);
    abaixo(Math.abs(dentro.valores[dentro.valores.length - 1]), 1e-6, 'a₀ = 0,9 deveria ir a 0');

    var fora = global.Iteracao.orbita(fn, 1.1, 400);
    ok(fora.parada === 'escape', 'a₀ = 1,1 deveria escapar, parada veio "' + fora.parada + '"');
    fora.valores.forEach(function (v) { num(v); });
    ok(Math.abs(fora.valores[fora.valores.length - 1]) > global.Iteracao.LIMITE_ESCAPE,
       'o último valor deveria ter passado do limite de escape');

    var fixo = global.Iteracao.orbita(fn, 1, 50);
    ok(fixo.parada === 'fixo', 'a₀ = 1 é ponto fixo; parada veio "' + fixo.parada + '"');
    return 'a₀ = 0,9 → 0; a₀ = 1 fica; a₀ = 1,1 diverge ("' + fora.mensagem + '")';
  });

  teste('Teia', 'Logística r=3,2 cai em ciclo de período 2 (critério de aceite 4)',
    function () {
      var f32 = global.Iteracao.porId('logistica32');
      var o32 = global.Iteracao.orbita(f32, 0.2, 400);
      var p32 = global.Iteracao.periodo(o32.valores);
      ok(p32 === 2, 'esperava período 2 em r = 3,2, veio ' + p32);

      var f28 = global.Iteracao.porId('logistica28');
      var o28 = global.Iteracao.orbita(f28, 0.2, 400);
      var p28 = global.Iteracao.periodo(o28.valores);
      ok(p28 === 1 || o28.parada === 'fixo',
         'esperava convergência para ponto fixo em r = 2,8, período veio ' + p28);

      var fim = o32.valores.slice(-2);
      return 'r=3,2: ciclo de período ' + p32 + ' entre ' +
             fim[0].toFixed(6) + ' e ' + fim[1].toFixed(6) +
             '; r=2,8: converge para ' + o28.valores[o28.valores.length - 1].toFixed(6);
    });

  teste('Teia', 'A teia não desenha segmentos degenerados sobre o ponto fixo', function () {
    var fn = global.Iteracao.porId('raiz6');
    var o = global.Iteracao.orbita(fn, 0, 200);
    var todos = global.Iteracao.segmentosTeia(o.valores, fn, 0);
    var podados = global.Iteracao.segmentosTeia(o.valores, fn, 1e-4);
    ok(podados.length < todos.length, 'a poda não removeu nada');
    ok(podados.length > 4, 'a poda removeu demais: sobraram ' + podados.length);
    podados.forEach(function (s) {
      num(s.x0); num(s.y0); num(s.x1); num(s.y1);
      var comp = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      ok(comp >= 1e-4 - 1e-12, 'sobrou segmento de comprimento ' + fmt(comp));
    });
    return todos.length + ' segmentos sem poda → ' + podados.length + ' com poda de 1e-4';
  });

  teste('Teia', 'Nenhum NaN ou Infinity em nenhum caminho das cinco funções',
    function () {
      var contados = 0;
      global.Iteracao.FUNCOES.forEach(function (fn) {
        var jan = fn.janela;
        for (var i = 0; i <= 80; i++) {
          var a0 = jan.x0 + (jan.x1 - jan.x0) * i / 80;
          var o = global.Iteracao.orbita(fn, a0, 60);
          ok(['ok', 'dominio', 'escape', 'fixo'].indexOf(o.parada) >= 0,
             'parada desconhecida: ' + o.parada);
          o.valores.forEach(function (v) { num(v); contados++; });
          global.Iteracao.segmentosTeia(o.valores, fn, 1e-6).forEach(function (s) {
            num(s.x0); num(s.y0); num(s.x1); num(s.y1);
            contados += 4;
          });
        }
        global.Iteracao.pontosFixos(fn).forEach(function (p) {
          num(p.x); num(p.dg); contados += 2;
        });
      });
      return contados.toLocaleString('pt-BR') + ' valores verificados';
    });

  // =========================================================================
  // Módulo 5 — equação do calor e equação da onda
  // =========================================================================

  teste('Calor', 'Parseval: a energia fechada de cada condição bate com a soma dos coeficientes',
    function () {
      var linhas = [];
      global.Difusao.CONDICOES.forEach(function (c) {
        var s = (c.a0 / 2) * (c.a0 / 2);
        var ate = 400000;
        for (var n = 1; n <= ate; n++) {
          var a = c.a(n), b = c.b(n);
          s += 0.5 * (a * a + b * b);
        }
        /* A soma trunca em 400 000 e a cauda que sobra não é ruído: nas funções
         * descontínuas |f̂(n)| ~ 1/n e a cauda vale cerca de 1/400000. A
         * tolerância é essa cauda, com folga — não um número escolhido para o
         * teste passar. */
        aprox(s, c.energia, 1e-5, 'energia de ' + c.id);
        linhas.push(c.id + ' ' + c.energia.toFixed(6));
      });
      return linhas.join('; ');
    });

  teste('Calor', 'Em t = 0 a solução é a soma parcial de Fourier do módulo 2',
    function () {
      /* Os dois módulos escrevem a mesma onda quadrada por caminhos diferentes:
       * ondas.js soma só os harmônicos ímpares indexados por n, difusao.js soma
       * todos os índices com os pares zerados. Tomando N = 2m − 1 as duas somas
       * têm exatamente os mesmos termos, e conferir isso amarra o módulo novo ao
       * que já estava testado. */
      var c = global.Difusao.porId('quadrada');
      var maior = 0;
      for (var m = 1; m <= 12; m++) {
        for (var i = 0; i <= 40; i++) {
          var x = -PI_TESTE + 2 * PI_TESTE * i / 40;
          var a = global.Difusao.avaliar(c, 'calor', 2 * m - 1, 0, x);
          var b = global.Ondas.quadrada.S(x, m);
          maior = Math.max(maior, Math.abs(a - b));
        }
      }
      abaixo(maior, 1e-12, 'maior diferença entre as duas somas parciais');
      return 'maior diferença em 12 × 41 pontos: ' + fmt(maior);
    });

  teste('Calor', 'Qualquer t > 0 mata o fenômeno de Gibbs: o erro despenca',
    function () {
      var c = global.Difusao.porId('quadrada');
      var e0 = global.Difusao.erroTruncamento(c, 'calor', 64, 0);
      var e1 = global.Difusao.erroTruncamento(c, 'calor', 64, 1e-3);
      var e2 = global.Difusao.erroTruncamento(c, 'calor', 64, 1e-2);
      ok(e0 > 0.05, 'em t = 0 o erro deveria ser da ordem de 5%, veio ' + fmt(e0));
      ok(e1 < 1e-3, 'em t = 1e-3 o erro deveria estar abaixo de 1e-3, veio ' + fmt(e1));
      ok(e2 < 1e-15, 'em t = 1e-2 o erro deveria estar abaixo de 1e-15, veio ' + fmt(e2));

      var t0 = global.Difusao.termosPara(c, 'calor', 0, 1e-6);
      var t2 = global.Difusao.termosPara(c, 'calor', 1e-2, 1e-6);
      ok(t0.saturou, 'em t = 0 a busca por termos deveria saturar');
      ok(t2.M > 0 && t2.M < 60, 'em t = 1e-2 deveriam bastar poucas dezenas, vieram ' + t2.M);
      return 'erro com N=64: ' + fmt(e0) + ' → ' + fmt(e1) + ' → ' + fmt(e2) +
             '; termos para 1e-6: mais de ' + global.Difusao.BUSCA_MAX + ' → ' + t2.M;
    });

  teste('Calor', 'A onda não suaviza nada e volta exatamente em t = 2π',
    function () {
      var c = global.Difusao.porId('quadrada');
      var xs = new Float64Array(64);
      for (var i = 0; i < 64; i++) xs[i] = -PI_TESTE + 2 * PI_TESTE * i / 63;
      var u0 = global.Difusao.perfil(c, 'onda', 64, 0, xs);
      var uT = global.Difusao.perfil(c, 'onda', 64, 2 * PI_TESTE, xs);
      var uNeg = global.Difusao.perfil(c, 'onda', 64, -1.3, xs);
      var uPos = global.Difusao.perfil(c, 'onda', 64, 1.3, xs);
      var volta = 0, reversa = 0;
      for (i = 0; i < 64; i++) {
        volta = Math.max(volta, Math.abs(u0[i] - uT[i]));
        reversa = Math.max(reversa, Math.abs(uNeg[i] - uPos[i]));
      }
      abaixo(volta, 1e-12, 'u(x, 2π) deveria coincidir com u(x, 0)');
      abaixo(reversa, 1e-12, 'a onda deveria ser par no tempo');

      // e o truncamento nunca melhora: a busca satura em todo instante
      [0, 0.5, 1.5, 3].forEach(function (t) {
        var r = global.Difusao.termosPara(c, 'onda', t, 1e-6);
        ok(r.saturou, 'a onda não deveria bastar-se com poucos termos em t = ' + t);
      });
      return 'volta com diferença ' + fmt(volta) + '; par no tempo com ' + fmt(reversa);
    });

  teste('Calor', 'O tempo para trás não converge, e mesmo assim nada estoura',
    function () {
      var c = global.Difusao.porId('quadrada');
      ok(global.Difusao.convergente('calor', -1e-6) === false, 'deveria acusar divergência');
      ok(global.Difusao.erroTruncamento(c, 'calor', 64, -1e-3) === null,
         'o erro deveria vir nulo, não um número sem significado');
      ok(global.Difusao.termosPara(c, 'calor', -1e-3, 1e-6).diverge === true,
         'a contagem de termos deveria acusar divergência');

      /* O pior caso possível da interface: todos os termos, o tempo mais para
       * trás que o controle alcança. O teto N_MAX foi escolhido para que este
       * número seja enorme e finito — se alguém subir N_MAX ou T_NEG_MIN sem
       * refazer a conta, este teste quebra antes de a página mostrar Infinity. */
      var pior = global.Difusao.amplitude(c, 'calor', global.Difusao.N_MAX,
                                          global.Difusao.T_NEG_MIN);
      num(pior);
      ok(pior > 1e50, 'a explosão deveria ser gritante, veio ' + fmt(pior));
      return 'amplitude no pior caso: ' + pior.toExponential(3) + ' (finita)';
    });

  teste('Calor', 'Nenhum NaN ou Infinity em nenhum caminho dos dois modos',
    function () {
      var contados = 0;
      var esperados = ['calor', 'onda'];
      var xs = new Float64Array(32);
      for (var i = 0; i < 32; i++) xs[i] = -PI_TESTE + 2 * PI_TESTE * i / 31;

      global.Difusao.CONDICOES.forEach(function (c) {
        esperados.forEach(function (modo) {
          /* Posições escolhidas, não uma varredura: cada ponto custa três somas
           * até N_CAP, e o que precisa ser coberto são os regimes — o extremo do
           * tempo para trás, a vizinhança do zero de cada lado, o zero exato, e
           * os dois extremos para a frente. */
          var posicoes = [global.Difusao.S_MIN, -50, -1, 0, 1, 250, 600,
                          global.Difusao.S_MAX];
          posicoes.forEach(function (s) {
            var t = global.Difusao.tempoDe(modo, s);
            num(t);
            [1, 64, global.Difusao.N_MAX].forEach(function (N) {
              var u = global.Difusao.perfil(c, modo, N, t, xs);
              for (var k = 0; k < u.length; k++) { num(u[k]); contados++; }

              var esp = global.Difusao.espectro(c, modo, N, t);
              for (k = 0; k < esp.mags.length; k++) {
                num(esp.mags[k]); num(esp.mags0[k]); contados += 2;
              }

              var err = global.Difusao.erroTruncamento(c, modo, N, t);
              if (err !== null) {
                num(err);
                ok(err >= 0 && err <= 1, 'erro relativo fora de [0,1]: ' + fmt(err));
                contados++;
              }
              var norma = global.Difusao.normaRelativa(c, modo, N, t);
              if (norma !== null) { num(norma); contados++; }
              num(global.Difusao.amplitude(c, modo, N, t, 32));
              contados++;
            });
          });
        });
      });
      return contados.toLocaleString('pt-BR') + ' valores verificados';
    });

  // =========================================================================
  // Módulo 6 — rearranjo de séries alternadas
  // =========================================================================

  teste('Rearranjo', 'p positivos para q negativos convergem para ln 2 + ½·ln(p/q)',
    function () {
      var h = global.Reordenacao.porId('harmonica');
      var linhas = [];
      [[1, 1], [2, 1], [4, 1], [1, 4], [3, 2]].forEach(function (par) {
        var r = global.Reordenacao.blocos(h, par[0], par[1], 200000);
        /* O erro do rearranjo em blocos cai como 1/K. Com 200 000 termos isso
         * dá alguns 1e-6, e é esse o tamanho da tolerância — não uma folga
         * escolhida a esmo. */
        aprox(r.soma, r.previsto, 2e-5, 'blocos ' + par[0] + ':' + par[1]);
        ok(r.travou === false, 'blocos não deveriam travar');
        linhas.push(par[0] + ':' + par[1] + ' → ' + r.soma.toFixed(6));
      });
      /* O caso 1:4 é o mais bonito de conferir: ln 2 + ½·ln(1/4) = ln 2 − ln 2,
       * exatamente zero. Uma série de termos todos não nulos, reordenada, com
       * soma zero. */
      var zero = global.Reordenacao.blocos(h, 1, 4, 200000);
      abaixo(Math.abs(zero.soma), 1e-4, 'o rearranjo 1:4 deveria somar zero');
      return linhas.join('; ');
    });

  teste('Rearranjo', 'O guloso alcança o alvo, e a proporção que ele usa é a prevista',
    function () {
      var h = global.Reordenacao.porId('harmonica');
      var linhas = [];
      [3, 1, 0, -2, Math.PI].forEach(function (alvo) {
        var r = global.Reordenacao.guloso(h, alvo, 200000);
        ok(r.alcancavel, 'todo alvo real deveria ser alcançável nesta série');
        ok(r.travou === false, 'o guloso não deveria travar numa série condicional');
        aprox(r.soma, alvo, 1e-3, 'alvo ' + alvo);

        /* O algoritmo não conhece esta fórmula: ele só compara a soma com o
         * alvo a cada passo. A proporção em que acaba consumindo as duas listas
         * é consequência, e bate com e^{2(S−ln2)} — a fórmula dos blocos,
         * invertida. */
        var previsto = h.previsaoProporcao(alvo);
        var relativo = Math.abs(r.proporcao - previsto) / previsto;
        abaixo(relativo, 5e-3, 'proporção p/q para o alvo ' + alvo);
        linhas.push(alvo.toFixed(2) + ': p/q ' + r.proporcao.toFixed(3) +
                    ' vs ' + previsto.toFixed(3));
      });
      return linhas.join('; ');
    });

  teste('Rearranjo', 'Toda travessia do alvo sobra menos que o termo que a causou',
    function () {
      /* É esta a propriedade que faz a construção de Riemann funcionar, e ela se
       * lê direto nas somas parciais: o algoritmo só troca de lista depois de
       * passar do alvo, então logo após uma travessia a distância até o alvo é
       * menor que o passo que acabou de ser dado. Como a_k → 0, as sobras vão a
       * zero — e é por isso que a soma converge para o alvo em vez de orbitá-lo.
       *
       * Verificado só a partir das somas parciais, sem repetir o algoritmo aqui:
       * o termo usado no passo k é a própria diferença somas[k] − somas[k−1]. */
      var h = global.Reordenacao.porId('harmonica');
      var linhas = [];
      var travessias = 0;
      [0, 1, 3, -2].forEach(function (alvo) {
        var r = global.Reordenacao.guloso(h, alvo, 60000);
        var piorCedo = 0, piorTarde = 0;
        var cedo = Math.round(r.K * 0.1), tarde = Math.round(r.K * 0.9);
        for (var k = 1; k < r.K; k++) {
          var antes = r.somas[k - 1], agora = r.somas[k];
          var cruzou = (antes > alvo && agora <= alvo) || (antes <= alvo && agora > alvo);
          if (!cruzou) continue;
          travessias++;
          var termo = Math.abs(agora - antes);
          var sobra = Math.abs(agora - alvo);
          ok(sobra <= termo + 1e-15,
             'alvo ' + alvo + ', termo ' + k + ': sobrou ' + fmt(sobra) +
             ' passando do termo ' + fmt(termo));
          if (k <= cedo && sobra > piorCedo) piorCedo = sobra;
          if (k >= tarde && sobra > piorTarde) piorTarde = sobra;
        }
        /* E as sobras precisam encolher: se ficassem do mesmo tamanho, a soma
         * oscilaria em torno do alvo para sempre sem convergir a ele. */
        ok(piorTarde < piorCedo / 5,
           'alvo ' + alvo + ': a sobra não encolheu — ' + fmt(piorCedo) +
           ' no primeiro décimo contra ' + fmt(piorTarde) + ' no último');
        linhas.push(alvo + ': ' + fmt(piorCedo) + ' → ' + fmt(piorTarde));
      });
      return travessias.toLocaleString('pt-BR') + ' travessias; maior sobra no ' +
             'primeiro décimo → no último, por alvo: ' + linhas.join('; ');
    });

  teste('Rearranjo', 'Absolutamente convergente: reordenar não move nada, e o guloso trava',
    function () {
      var q = global.Reordenacao.porId('quadrados');
      [[1, 1], [4, 1], [1, 4], [7, 3]].forEach(function (par) {
        var r = global.Reordenacao.blocos(q, par[0], par[1], 200000);
        /* Dirichlet: absolutamente convergente, todo rearranjo dá o mesmo. Aqui
         * p e q são os controles da interface, e o teste garante que mexer neles
         * não muda o limite. */
        aprox(r.soma, global.Reordenacao.PI2_12, 1e-4,
              'blocos ' + par[0] + ':' + par[1] + ' deveriam dar π²/12');
      });

      var dentro = global.Reordenacao.guloso(q, 1.0, 200000);
      ok(dentro.travou, 'o guloso deveria travar numa série absolutamente convergente');
      ok(Math.abs(dentro.soma - 1.0) > 1e-3,
         'e não deveria alcançar o alvo, mas chegou a ' + fmt(dentro.soma));

      var fora = global.Reordenacao.guloso(q, 3, 200000);
      ok(fora.alcancavel === false, 'um alvo acima de Σ positivos é inalcançável');
      abaixo(Math.abs(fora.soma - q.somaPositivos), 1e-3,
             'sem negativos a soma deveria empilhar em Σ positivos');
      return 'π²/12 = ' + global.Reordenacao.PI2_12.toFixed(8) +
             '; guloso com alvo 1 parou em ' + dentro.soma.toFixed(6);
    });

  teste('Rearranjo', 'O envelope não perde nem inventa amostra, e sabe ligar as colunas',
    function () {
      var h = global.Reordenacao.porId('harmonica');
      var r = global.Reordenacao.guloso(h, 3, 200000);
      var contados = 0;
      var relato = [];
      ['log', 'linear'].forEach(function (escala) {
        [80, 600, 1600].forEach(function (colunas) {
          var env = global.Reordenacao.envelope(r.somas, 1, r.K, colunas, escala);
          var somaContas = 0, vazias = 0, ralas = 0, cheias = 0;
          for (var c = 0; c < env.colunas; c++) {
            somaContas += env.conta[c];
            if (env.vazio[c]) { vazias++; ok(env.conta[c] === 0, 'coluna vazia com amostra'); continue; }
            num(env.min[c]); num(env.max[c]); num(env.primeiro[c]); num(env.ultimo[c]);
            ok(env.min[c] <= env.max[c], 'mínimo acima do máximo na coluna ' + c);
            /* primeiro e ultimo são o que liga uma coluna à seguinte; se
             * escapassem da faixa [min, max] o traço sairia da própria curva. */
            ok(env.primeiro[c] >= env.min[c] && env.primeiro[c] <= env.max[c],
               'primeiro fora de [min, max] na coluna ' + c);
            ok(env.ultimo[c] >= env.min[c] && env.ultimo[c] <= env.max[c],
               'ultimo fora de [min, max] na coluna ' + c);
            if (env.conta[c] === 1) ralas++; else cheias++;
            contados += 4;
          }
          /* Nenhuma soma parcial pode ficar de fora: o envelope é uma
           * reorganização das K amostras, não uma amostragem delas. */
          ok(somaContas === r.K, escala + '/' + colunas + ': ' + somaContas +
             ' amostras distribuídas, esperava ' + r.K);
          var f = global.Reordenacao.faixa(env);
          ok(f !== null, 'faixa vazia');
          num(f.y0); num(f.y1);
          if (escala === 'log' && colunas === 600) {
            /* É este o regime que quebrou o desenho: em log com 600 colunas as
             * primeiras centenas recebem zero ou uma amostra. O envelope pode
             * ter altura nula ali — o que não pode é o traço perder a ligação. */
            ok(vazias > 0 && ralas > 0,
               'esperava colunas vazias e ralas em escala log, vieram ' + vazias +
               ' e ' + ralas);
            relato.push('log/600: ' + vazias + ' vazias, ' + ralas + ' com uma amostra, ' +
                        cheias + ' com várias');
          }
        });
      });
      return contados.toLocaleString('pt-BR') + ' valores verificados; ' + relato.join('');
    });

  teste('Rearranjo', 'Nenhum NaN ou Infinity em nenhum caminho das duas séries',
    function () {
      var contados = 0;
      global.Reordenacao.SERIES.forEach(function (serie) {
        [-5, -1, 0, 0.5, 2, 7].forEach(function (alvo) {
          var r = global.Reordenacao.guloso(serie, alvo, 5000);
          for (var k = 0; k < r.K; k++) { num(r.somas[k]); contados++; }
          if (r.proporcao !== null) { num(r.proporcao); contados++; }
        });
        for (var p = 1; p <= 6; p++) {
          for (var q = 1; q <= 6; q++) {
            var b = global.Reordenacao.blocos(serie, p, q, 3000);
            for (var k2 = 0; k2 < b.K; k2++) { num(b.somas[k2]); contados++; }
            num(b.previsto); num(b.erro);
            contados += 2;
          }
        }
      });
      return contados.toLocaleString('pt-BR') + ' valores verificados';
    });

  // =========================================================================
  // Formatação de número
  // =========================================================================

  teste('Formato', 'Nada de NaN, Infinity ou exponencial crua, em nenhuma ordem de grandeza',
    function () {
      /* A regra do projeto é que todo número exibido passe por formatação. Este
       * teste varre doze ordens de grandeza para cada lado, mais os casos que
       * costumam escapar — zero, negativo, e os próprios não finitos. */
      var proibido = /NaN|Infinity|e[+-]\d/;
      var contados = 0;
      var valores = [0, 1, -1, 0.5, -0.5];
      for (var k = -300; k <= 300; k += 7) {
        valores.push(Math.pow(10, k), -Math.pow(10, k), 9.999 * Math.pow(10, k));
      }
      valores.forEach(function (v) {
        [global.Formato.br(v, 4), global.Formato.cientifica(v),
         global.Formato.numero(v), global.Formato.porcento(v),
         global.Formato.inteiro(v)].forEach(function (texto) {
          ok(typeof texto === 'string' && texto.length > 0, 'texto vazio para ' + v);
          ok(!proibido.test(texto), 'saiu "' + texto + '" para ' + v);
          contados++;
        });
      });

      [NaN, Infinity, -Infinity, undefined, null].forEach(function (v) {
        ok(global.Formato.numero(v) === global.Formato.AUSENTE,
           'valor não finito deveria virar travessão, veio "' + global.Formato.numero(v) + '"');
        ok(global.Formato.cientifica(v) === global.Formato.AUSENTE, 'idem em cientifica');
        contados += 2;
      });
      return contados.toLocaleString('pt-BR') + ' textos verificados';
    });

  teste('Formato', 'Vírgula decimal, menos tipográfico e mantissa que não vira 10',
    function () {
      ok(global.Formato.br(1.5, 2) === '1,50', 'vírgula decimal: ' + global.Formato.br(1.5, 2));
      ok(global.Formato.br(-1.5, 2) === '−1,50',
         'o menos deveria ser o tipográfico: ' + global.Formato.br(-1.5, 2));

      /* 9,999 com duas casas arredonda para 10,00 — que está certo e se lê mal.
       * O formatador precisa subir o expoente em vez de escrever "10,00 × 10ⁿ". */
      var t = global.Formato.cientifica(9.999e20, 2);
      ok(t.indexOf('10,00') < 0, 'mantissa não normalizada: ' + t);
      ok(t === '1,00 × 10²¹', 'esperava 1,00 × 10²¹, veio ' + t);

      ok(global.Formato.expoente(-21) === '⁻²¹', 'expoente negativo malformado');
      ok(global.Formato.inteiro(20000) === '20.000', 'separador de milhar: ' + global.Formato.inteiro(20000));
      return '1,50 / −1,50 / ' + t + ' / ' + global.Formato.inteiro(20000);
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
