/* geratriz.js — controlador do módulo 4.
 *
 * A matemática vive em polinomios.js; o desenho genérico, em plot.js.
 * Aqui só existe o que amarra os dois ao DOM.
 */
(function (global) {
  'use strict';

  var N_TERMOS = 55;      // termos calculados (BigInt aguenta; o gráfico usa menos)
  var N_MOSTRA = 12;      // termos exibidos, para conferir a recorrência à mão

  var el = {};
  var estado = { ordem: 2, alfa: [1, 1, 0], c: [1, 2, 0] };
  var dados = null;
  var pendente = false;

  /* Exemplos pré-carregados. Os dois primeiros vêm de questões de prova e são
   * os casos que testes.html trava; os outros dois existem para mostrar os
   * regimes que eles não cobrem. */
  var EXEMPLOS = [
    { id: 'p2', rotulo: 'P2 — seqrecursiva', ordem: 2, alfa: [1, 1, 0], c: [1, 2, 0] },
    { id: 'prep', rotulo: 'pré-P — seqrecursiva-2', ordem: 2, alfa: [1, 1, 0], c: [2, 3, 0] },
    { id: 'fib', rotulo: 'Fibonacci', ordem: 2, alfa: [1, 1, 0], c: [1, 1, 0] },
    { id: 'periodica', rotulo: 'periódica (sem raiz dominante)', ordem: 2, alfa: [1, 1, 0], c: [0, -1, 0] },
    { id: 'tribonacci', rotulo: 'Tribonacci (ordem 3)', ordem: 3, alfa: [1, 1, 1], c: [1, 1, 1] }
  ];

  // =========================================================================
  // Cálculo
  // =========================================================================

  function recalcular() {
    var k = estado.ordem;
    dados = global.Polinomios.analisar(
      estado.alfa.slice(0, k), estado.c.slice(0, k), N_TERMOS);
  }

  // =========================================================================
  // Formatação
  // =========================================================================

  function br(v, casas) {
    return v.toFixed(casas).replace('.', ',').replace('-', '−');
  }

  /* Inteiros longos com separador de milhar; nunca notação exponencial crua. */
  function inteiroBr(v) {
    var s = (typeof v === 'bigint') ? v.toString() : String(Math.round(v));
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var partes = [];
    while (s.length > 3) { partes.unshift(s.slice(-3)); s = s.slice(0, -3); }
    partes.unshift(s);
    return (neg ? '−' : '') + partes.join('.');
  }

  function complexoTexto(z) {
    var re = z.re, im = z.im;
    if (Math.abs(im) < 1e-12) return br(re, 4);
    var sinal = im < 0 ? ' − ' : ' + ';
    var parteRe = Math.abs(re) < 1e-12 ? '' : br(re, 4);
    var mag = Math.abs(im);
    var parteIm = (Math.abs(mag - 1) < 1e-12 ? '' : br(mag, 4)) + 'i';
    if (!parteRe) return (im < 0 ? '−' : '') + parteIm;
    return parteRe + sinal + parteIm;
  }

  // =========================================================================
  // Painel 1 — forma racional e derivação
  // =========================================================================

  function montarFormaRacional() {
    var P = global.Polinomios;
    var k = estado.ordem;
    var c = estado.c.slice(0, k);
    var alfa = estado.alfa.slice(0, k);

    var latexP = P.paraLatex(dados.P);
    var latexQ = P.paraLatex(dados.Q);
    el.formaRacional.setAttribute('data-math-display',
      'f(x)=\\sum_{n\\ge 0}\\alpha_n x^{n}=\\frac{' + latexP + '}{' + latexQ + '}');

    /* A derivação em três linhas: é o que o aluno precisa saber reproduzir na
     * prova, e não adianta só mostrar o resultado. */
    var termosRec = [];
    for (var j = 0; j < k; j++) {
      var coef = c[j];
      if (coef === 0) continue;
      var mag = Math.abs(coef) === 1 ? '' : String(Math.abs(coef));
      termosRec.push((coef < 0 ? '+' : '-') + ' ' + mag +
                     '\\alpha_{m-' + (j + 1) + '}');
    }
    var linhaRec = '\\alpha_m ' + (termosRec.join(' ') || '') + ' = 0';

    el.derivacao1.setAttribute('data-math-display',
      'Q(x)\\,f(x)=\\bigl(' + latexQ + '\\bigr)\\sum_{n\\ge 0}\\alpha_n x^{n}');
    el.derivacao2.setAttribute('data-math-display',
      '[x^{m}],\\; m\\ge ' + k + ':\\qquad ' + linhaRec +
      '\\quad\\text{(a própria recorrência)}');

    var termosP = [];
    for (var m = 0; m < dados.P.length; m++) {
      termosP.push('\\alpha_' + m);
    }
    el.derivacao3.setAttribute('data-math-display',
      'P(x)=Q(x)\\,f(x)=' + latexP +
      '\\qquad\\text{com }' + alfa.map(function (v, i) {
        return '\\alpha_' + i + '=' + v;
      }).join(',\\; '));
  }

  // =========================================================================
  // Painel 2 — plano complexo
  // =========================================================================

  function desenharPlano(c) {
    var a = global.Plot.ajustar(el.canvasPlano);
    var P = global.Polinomios;

    // enquadramento: todas as raízes, o disco, e sempre a origem
    var lim = 1;
    dados.raizes.forEach(function (z) {
      lim = Math.max(lim, Math.abs(z.re), Math.abs(z.im));
    });
    if (isFinite(dados.R)) lim = Math.max(lim, dados.R);
    lim *= 1.25;

    var esc = global.Plot.escalaIsometrica({
      w: a.w, h: a.h, margem: { esq: 34, dir: 14, topo: 14, base: 24 },
      caixa: { x0: -lim, x1: lim, y0: -lim, y1: lim }, folga: 0.02
    });

    var marcas = [-2, -1, 0, 1, 2].filter(function (v) {
      return v >= esc.x0 && v <= esc.x1;
    }).map(function (v) { return { v: v, rotulo: v === 0 ? '0' : String(v) }; });
    global.Plot.eixos(a.ctx, esc, c, { marcasX: marcas, marcasY: marcas });

    // disco de convergência
    if (isFinite(dados.R) && dados.R > 0) {
      global.Plot.circulo(a.ctx, esc, 0, 0, dados.R, {
        preenchimento: c.destaque, alpha: 0.08,
        cor: c.destaque, largura: 1.5
      });
    }

    // as raízes; a que realiza o mínimo em destaque
    dados.raizes.forEach(function (z, i) {
      var minima = (i === dados.indiceMinima);
      global.Plot.ponto(a.ctx, esc, z.re, z.im, {
        cor: minima ? c.limite : c.referencia,
        raio: minima ? 5 : 3.5
      });
      global.Plot.rotulo(a.ctx, esc, z.re, z.im, complexoTexto(z), {
        cor: minima ? c.limite : c.tintaFraca,
        dx: 7, dy: -5, tamanho: minima ? 12 : 11
      });
    });

    // eixos rotulados
    global.Plot.rotulo(a.ctx, esc, esc.x1, 0, 'Re', {
      cor: c.tintaFraca, dx: -16, dy: -5
    });
    global.Plot.rotulo(a.ctx, esc, 0, esc.y1, 'Im', {
      cor: c.tintaFraca, dx: 6, dy: 14
    });
  }

  // =========================================================================
  // Painel 3 — crescimento
  // =========================================================================

  function desenharCrescimento(c) {
    var a = global.Plot.ajustar(el.canvasCrescimento);

    var razoes = dados.razoes;
    var pontosX = [], pontosY = [];
    var minY = Infinity, maxY = -Infinity;
    for (var n = 0; n < razoes.length; n++) {
      var r = razoes[n];
      if (!isFinite(r)) continue;          // razão indefinida: não entra
      pontosX.push(n);
      pontosY.push(r);
      if (r < minY) minY = r;
      if (r > maxY) maxY = r;
    }

    var temLimite = dados.dominante && isFinite(dados.taxa);
    if (temLimite) {
      minY = Math.min(minY, dados.taxa);
      maxY = Math.max(maxY, dados.taxa);
    }
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    var folga = Math.max((maxY - minY) * 0.18, 0.35);

    var esc = global.Plot.escala({
      w: a.w, h: a.h, margem: { esq: 44, dir: 12, topo: 12, base: 24 },
      x0: 0, x1: Math.max(razoes.length - 1, 5),
      y0: minY - folga, y1: maxY + folga
    });

    var passoX = Math.max(5, Math.round((razoes.length - 1) / 5 / 5) * 5);
    var marcasX = [];
    for (var v = 0; v <= razoes.length - 1; v += passoX) {
      marcasX.push({ v: v, rotulo: String(v) });
    }
    var marcasY = [];
    for (var t = Math.ceil(esc.y0); t <= Math.floor(esc.y1); t++) {
      marcasY.push({ v: t, rotulo: String(t).replace('-', '−') });
    }
    global.Plot.eixos(a.ctx, esc, c, { marcasX: marcasX, marcasY: marcasY });

    /* A tracejada só existe quando existe limite. Sem raiz dominante a razão
     * oscila para sempre, e desenhar uma reta ali seria afirmar algo falso. */
    if (temLimite) {
      global.Plot.linhaH(a.ctx, esc, dados.taxa, {
        cor: c.limite, tracejado: [4, 3],
        rotulo: '1/R = ' + br(dados.taxa, 4)
      });
    }

    global.Plot.serie(a.ctx, esc, pontosX, pontosY, { cor: c.destaque, largura: 1.7 });
    for (var i = 0; i < pontosX.length; i++) {
      global.Plot.ponto(a.ctx, esc, pontosX[i], pontosY[i], { cor: c.destaque, raio: 1.8 });
    }
  }

  // =========================================================================
  // Indicadores e texto
  // =========================================================================

  function atualizarIndicadores() {
    // raio
    if (dados.R === Infinity) {
      el.indRaio.textContent = '∞';
      el.indRaioApoio.textContent = 'Q é constante: f é polinômio';
    } else {
      el.indRaio.textContent = br(dados.R, 6);
      el.indRaioApoio.textContent = 'distância até a raiz mais próxima';
    }

    // taxa de crescimento
    if (dados.R === Infinity) {
      el.indTaxa.textContent = '—';
      el.indTaxaApoio.textContent = 'a sequência é finita';
    } else if (dados.dominante) {
      el.indTaxa.textContent = br(dados.taxa, 6);
      el.indTaxaApoio.textContent = 'αₙ₊₁/αₙ converge para 1/R';
    } else {
      el.indTaxa.textContent = 'não existe';
      el.indTaxaApoio.textContent = 'a razão oscila: sem raiz dominante';
    }
    el.indTaxa.classList.toggle('estavel', !dados.dominante);

    // raízes
    el.indRaizes.textContent = dados.raizes.length
      ? dados.raizes.map(complexoTexto).join(',  ')
      : 'nenhuma';
    el.indRaizesApoio.textContent = dados.raizes.length
      ? 'em destaque, a de menor módulo'
      : 'Q(x) = 1 não se anula';

    // nota sobre ausência de raiz dominante
    var semDominante = dados.raizes.length > 0 && !dados.dominante;
    el.aviso.hidden = !semDominante;

    // termos
    el.termos.textContent = '';
    var lista = dados.exatos || dados.termos;
    for (var i = 0; i < Math.min(N_MOSTRA, lista.length); i++) {
      var item = document.createElement('li');
      var idx = document.createElement('span');
      idx.className = 'indice';
      idx.textContent = 'α' + subscrito(i);
      var val = document.createElement('span');
      val.className = 'valor';
      val.textContent = dados.exatos ? inteiroBr(lista[i]) : br(lista[i], 4);
      item.appendChild(idx);
      item.appendChild(val);
      el.termos.appendChild(item);
    }
  }

  function subscrito(n) {
    var mapa = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    return String(n).split('').map(function (d) { return mapa[+d]; }).join('');
  }

  // =========================================================================
  // Entrada
  // =========================================================================

  function lerCampos() {
    var k = estado.ordem;
    for (var i = 0; i < 3; i++) {
      estado.alfa[i] = valorDe(el.alfa[i], estado.alfa[i]);
      estado.c[i] = valorDe(el.c[i], estado.c[i]);
    }
    // campos além da ordem não participam da conta
    for (i = k; i < 3; i++) { estado.c[i] = 0; }
  }

  /* Campo vazio ou inválido preserva o último valor bom, em vez de virar NaN. */
  function valorDe(campo, anterior) {
    if (!campo) return anterior;
    var v = parseFloat(campo.value);
    if (!isFinite(v)) return anterior;
    return Math.max(-999, Math.min(999, v));
  }

  function escreverCampos() {
    for (var i = 0; i < 3; i++) {
      if (el.alfa[i]) el.alfa[i].value = String(estado.alfa[i]);
      if (el.c[i]) el.c[i].value = String(estado.c[i]);
    }
    var k = estado.ordem;
    el.linhaOrdem3.hidden = (k < 3);
    el.botoesOrdem.forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.ordem === k));
    });
  }

  function aplicarExemplo(ex) {
    estado.ordem = ex.ordem;
    estado.alfa = ex.alfa.slice();
    while (estado.alfa.length < 3) estado.alfa.push(0);
    estado.c = ex.c.slice();
    while (estado.c.length < 3) estado.c.push(0);
    escreverCampos();
    recalcular();
    agendar();
  }

  // =========================================================================
  // Ciclo
  // =========================================================================

  function desenhar() {
    var c = global.Plot.cores(document.body);
    montarFormaRacional();
    global.Formulas.renderizar();
    desenharPlano(c);
    desenharCrescimento(c);
    atualizarIndicadores();
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    global.requestAnimationFrame(function () { pendente = false; desenhar(); });
  }

  function iniciar() {
    el.alfa = [
      document.getElementById('campo-a0'),
      document.getElementById('campo-a1'),
      document.getElementById('campo-a2')
    ];
    el.c = [
      document.getElementById('campo-c1'),
      document.getElementById('campo-c2'),
      document.getElementById('campo-c3')
    ];
    el.linhaOrdem3 = document.getElementById('linha-ordem-3');
    el.exemplos = document.getElementById('exemplos');
    el.formaRacional = document.getElementById('forma-racional');
    el.derivacao1 = document.getElementById('derivacao-1');
    el.derivacao2 = document.getElementById('derivacao-2');
    el.derivacao3 = document.getElementById('derivacao-3');
    el.canvasPlano = document.getElementById('canvas-plano');
    el.canvasCrescimento = document.getElementById('canvas-crescimento');
    el.indRaio = document.getElementById('ind-raio');
    el.indRaioApoio = document.getElementById('ind-raio-apoio');
    el.indTaxa = document.getElementById('ind-taxa');
    el.indTaxaApoio = document.getElementById('ind-taxa-apoio');
    el.indRaizes = document.getElementById('ind-raizes');
    el.indRaizesApoio = document.getElementById('ind-raizes-apoio');
    el.aviso = document.getElementById('aviso-dominante');
    el.termos = document.getElementById('termos');

    // seletor de ordem
    el.botoesOrdem = [];
    var grupoOrdem = document.getElementById('seletor-ordem');
    [2, 3].forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = 'ordem ' + k;
      b.dataset.ordem = String(k);
      b.addEventListener('click', function () {
        estado.ordem = k;
        escreverCampos();
        lerCampos();
        recalcular();
        agendar();
      });
      grupoOrdem.appendChild(b);
      el.botoesOrdem.push(b);
    });

    // exemplos
    EXEMPLOS.forEach(function (ex) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-curva';
      b.textContent = ex.rotulo;
      b.addEventListener('click', function () { aplicarExemplo(ex); });
      el.exemplos.appendChild(b);
    });

    el.alfa.concat(el.c).forEach(function (campo) {
      if (!campo) return;
      campo.addEventListener('input', function () {
        lerCampos();
        recalcular();
        agendar();
      });
    });

    global.addEventListener('resize', agendar);

    escreverCampos();
    recalcular();
    agendar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
