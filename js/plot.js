/* plot.js — helpers de canvas: escala, eixos, traçado.
 *
 * Sem biblioteca de gráficos. Este arquivo toca no DOM (é um helper de
 * desenho), mas não sabe nada de Fourier: recebe números e desenha.
 * Registra-se em globalThis.Plot.
 */
(function (global) {
  'use strict';

  /* Ajusta o buffer do canvas ao tamanho em CSS vezes o devicePixelRatio e
   * devolve um contexto já escalado, para o traço não sair borrado nem
   * distorcido ao redimensionar a janela. */
  function ajustar(canvas, alturaCss) {
    var dpr = global.devicePixelRatio || 1;
    var caixa = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(caixa.width));
    var h = Math.max(1, Math.round(alturaCss || caixa.height));
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  /* Lê os tokens de cor do CSS, para o desenho seguir o modo claro/escuro
   * sem duplicar a paleta aqui dentro. */
  function cores(elemento) {
    var cs = getComputedStyle(elemento || document.documentElement);
    function t(nome, alt) {
      var v = cs.getPropertyValue(nome);
      return (v && v.trim()) || alt;
    }
    return {
      tinta: t('--tinta', '#16181a'),
      tintaFraca: t('--tinta-fraca', '#6b7175'),
      destaque: t('--destaque', '#16606e'),
      eixo: t('--grafico-eixo', '#b4b4ac'),
      grade: t('--grafico-grade', '#ebebe4'),
      referencia: t('--grafico-referencia', '#8d9396'),
      limite: t('--grafico-limite', '#a3282a'),
      papel: t('--papel', '#ffffff')
    };
  }

  /* Escala linear de dados para pixels, com margens. */
  function escala(cfg) {
    var m = cfg.margem;
    var pw = cfg.w - m.esq - m.dir;
    var ph = cfg.h - m.topo - m.base;
    var x0 = cfg.x0, x1 = cfg.x1, y0 = cfg.y0, y1 = cfg.y1;
    return {
      w: cfg.w, h: cfg.h, margem: m, pw: pw, ph: ph,
      x0: x0, x1: x1, y0: y0, y1: y1,
      px: function (x) { return m.esq + (x - x0) / (x1 - x0) * pw; },
      py: function (y) { return m.topo + (y1 - y) / (y1 - y0) * ph; }
    };
  }

  /* Inverso de px/py: de pixel para coordenada de dados. É o que permite
   * arrastar um marcador sobre o canvas e saber que valor ele representa. */
  function inverterX(esc, px) {
    return esc.x0 + (px - esc.margem.esq) * (esc.x1 - esc.x0) / esc.pw;
  }
  function inverterY(esc, py) {
    return esc.y1 - (py - esc.margem.topo) * (esc.y1 - esc.y0) / esc.ph;
  }

  /* Escala isométrica: expande o domínio menor até que uma unidade em x meça o
   * mesmo que uma unidade em y. Sem isso o círculo sai elipse — o que estraga
   * tanto a cadeia de epiciclos quanto o disco de convergência no plano
   * complexo. Recebe a caixa dos dados { x0, x1, y0, y1 } e a folga relativa. */
  function escalaIsometrica(cfg) {
    var m = cfg.margem;
    var pw = cfg.w - m.esq - m.dir;
    var ph = cfg.h - m.topo - m.base;
    var folga = cfg.folga === undefined ? 0.06 : cfg.folga;
    var caixa = cfg.caixa;

    var lx = ((caixa.x1 - caixa.x0) || 1) * (1 + 2 * folga);
    var ly = ((caixa.y1 - caixa.y0) || 1) * (1 + 2 * folga);
    var cx = (caixa.x0 + caixa.x1) / 2;
    var cy = (caixa.y0 + caixa.y1) / 2;

    var porPixel = Math.max(lx / pw, ly / ph);
    var semiX = porPixel * pw / 2;
    var semiY = porPixel * ph / 2;

    return escala({
      w: cfg.w, h: cfg.h, margem: m,
      x0: cx - semiX, x1: cx + semiX,
      y0: cy - semiY, y1: cy + semiY
    });
  }

  /* Círculo em coordenadas de dados. Só faz sentido sob escala isométrica —
   * o raio é convertido pela escala horizontal. */
  function circulo(ctx, esc, cx, cy, raio, opcoes) {
    var o = opcoes || {};
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(raio) || raio <= 0) return;
    var r = Math.abs(esc.px(cx + raio) - esc.px(cx));
    if (!(r > 0) || r > 1e5) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(esc.px(cx), esc.py(cy), r, 0, 2 * Math.PI);
    if (o.preenchimento) {
      ctx.fillStyle = o.preenchimento;
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (o.cor) {
      ctx.strokeStyle = o.cor;
      ctx.lineWidth = o.largura || 1;
      if (o.tracejado) ctx.setLineDash(o.tracejado);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Rótulo curto ancorado num ponto de dados. */
  function rotulo(ctx, esc, x, y, texto, opcoes) {
    var o = opcoes || {};
    if (!isFinite(x) || !isFinite(y)) return;
    ctx.save();
    ctx.fillStyle = o.cor;
    ctx.font = (o.tamanho || 11) + 'px ' + (o.fonte || 'system-ui, sans-serif');
    ctx.textAlign = o.alinhamento || 'left';
    ctx.textBaseline = o.base || 'bottom';
    ctx.fillText(texto, esc.px(x) + (o.dx || 0), esc.py(y) + (o.dy || 0));
    ctx.restore();
  }

  /* Grade e eixos. marcasX / marcasY: [{ v, rotulo }]. */
  function eixos(ctx, esc, c, opcoes) {
    var o = opcoes || {};
    var mx = o.marcasX || [], my = o.marcasY || [];
    var i, p;

    ctx.save();
    ctx.lineWidth = 1;

    // grade
    ctx.strokeStyle = c.grade;
    ctx.beginPath();
    for (i = 0; i < mx.length; i++) {
      p = Math.round(esc.px(mx[i].v)) + 0.5;
      ctx.moveTo(p, esc.margem.topo);
      ctx.lineTo(p, esc.margem.topo + esc.ph);
    }
    for (i = 0; i < my.length; i++) {
      p = Math.round(esc.py(my[i].v)) + 0.5;
      ctx.moveTo(esc.margem.esq, p);
      ctx.lineTo(esc.margem.esq + esc.pw, p);
    }
    ctx.stroke();

    // eixos em y = 0 e x = 0, quando dentro da faixa
    ctx.strokeStyle = c.eixo;
    ctx.beginPath();
    if (esc.y0 <= 0 && esc.y1 >= 0) {
      p = Math.round(esc.py(0)) + 0.5;
      ctx.moveTo(esc.margem.esq, p);
      ctx.lineTo(esc.margem.esq + esc.pw, p);
    }
    if (esc.x0 <= 0 && esc.x1 >= 0) {
      p = Math.round(esc.px(0)) + 0.5;
      ctx.moveTo(p, esc.margem.topo);
      ctx.lineTo(p, esc.margem.topo + esc.ph);
    }
    ctx.stroke();

    // rótulos
    ctx.fillStyle = c.tintaFraca;
    ctx.font = '11px ' + (o.fonte || 'system-ui, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; i < mx.length; i++) {
      if (mx[i].rotulo === undefined) continue;
      ctx.fillText(mx[i].rotulo, esc.px(mx[i].v), esc.margem.topo + esc.ph + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = 0; i < my.length; i++) {
      if (my[i].rotulo === undefined) continue;
      ctx.fillText(my[i].rotulo, esc.margem.esq - 6, esc.py(my[i].v));
    }
    ctx.restore();
  }

  /* Traça y = f(x) amostrando n pontos. `descontinuidades` é uma lista de x
   * onde o traço deve ser interrompido, para não desenhar a reta vertical
   * falsa do salto. */
  function funcao(ctx, esc, f, opcoes) {
    var o = opcoes || {};
    var n = o.n || Math.max(200, Math.round(esc.pw * 2));
    var quebras = o.descontinuidades || [];
    var eps = (esc.x1 - esc.x0) * 1e-6;

    ctx.save();
    ctx.strokeStyle = o.cor;
    ctx.lineWidth = o.largura || 1.5;
    ctx.lineJoin = 'round';
    if (o.tracejado) ctx.setLineDash(o.tracejado);
    ctx.beginPath();

    var novo = true;
    for (var i = 0; i <= n; i++) {
      var x = esc.x0 + (esc.x1 - esc.x0) * i / n;
      // não avalia exatamente sobre um salto: pega o lado que está sendo traçado
      for (var q = 0; q < quebras.length; q++) {
        if (Math.abs(x - quebras[q]) < eps) { novo = true; }
      }
      var y = f(x);
      if (!isFinite(y)) { novo = true; continue; }
      var px = esc.px(x), py = esc.py(Math.max(esc.y0, Math.min(esc.y1, y)));
      if (novo) { ctx.moveTo(px, py); novo = false; } else { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Traça uma poligonal a partir de vetores de dados. */
  function serie(ctx, esc, xs, ys, opcoes) {
    var o = opcoes || {};
    ctx.save();
    ctx.strokeStyle = o.cor;
    ctx.lineWidth = o.largura || 1.5;
    ctx.lineJoin = 'round';
    if (o.tracejado) ctx.setLineDash(o.tracejado);
    ctx.beginPath();
    var novo = true;
    for (var i = 0; i < xs.length; i++) {
      if (!isFinite(ys[i])) { novo = true; continue; }
      var px = esc.px(xs[i]), py = esc.py(ys[i]);
      if (novo) { ctx.moveTo(px, py); novo = false; } else { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Linha horizontal de referência, com rótulo opcional à direita. */
  function linhaH(ctx, esc, y, opcoes) {
    var o = opcoes || {};
    if (y < esc.y0 || y > esc.y1) return;
    var py = Math.round(esc.py(y)) + 0.5;
    ctx.save();
    ctx.strokeStyle = o.cor;
    ctx.lineWidth = o.largura || 1;
    ctx.setLineDash(o.tracejado || [4, 3]);
    ctx.beginPath();
    ctx.moveTo(esc.margem.esq, py);
    ctx.lineTo(esc.margem.esq + esc.pw, py);
    ctx.stroke();
    if (o.rotulo) {
      ctx.setLineDash([]);
      ctx.fillStyle = o.cor;
      ctx.font = '11px ' + (o.fonte || 'system-ui, sans-serif');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.rotulo, esc.margem.esq + esc.pw - 3, py - 3);
    }
    ctx.restore();
  }

  /* Linha vertical de referência, com rótulo opcional no topo. */
  function linhaV(ctx, esc, x, opcoes) {
    var o = opcoes || {};
    if (x < esc.x0 || x > esc.x1) return;
    var px = Math.round(esc.px(x)) + 0.5;
    ctx.save();
    ctx.strokeStyle = o.cor;
    ctx.lineWidth = o.largura || 1;
    ctx.setLineDash(o.tracejado || [4, 3]);
    ctx.beginPath();
    ctx.moveTo(px, esc.margem.topo);
    ctx.lineTo(px, esc.margem.topo + esc.ph);
    ctx.stroke();
    if (o.rotulo) {
      ctx.setLineDash([]);
      ctx.fillStyle = o.cor;
      ctx.font = '11px ' + (o.fonte || 'system-ui, sans-serif');
      ctx.textAlign = px > esc.margem.esq + esc.pw * 0.75 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      var dx = ctx.textAlign === 'right' ? -4 : 4;
      ctx.fillText(o.rotulo, px + dx, esc.margem.topo + 2);
    }
    ctx.restore();
  }

  /* Marcador circular. */
  function ponto(ctx, esc, x, y, opcoes) {
    var o = opcoes || {};
    if (!isFinite(x) || !isFinite(y)) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(esc.px(x), esc.py(y), o.raio || 3, 0, 2 * Math.PI);
    ctx.fillStyle = o.cor;
    ctx.fill();
    ctx.restore();
  }

  global.Plot = {
    ajustar: ajustar,
    cores: cores,
    escala: escala,
    escalaIsometrica: escalaIsometrica,
    inverterX: inverterX,
    inverterY: inverterY,
    circulo: circulo,
    rotulo: rotulo,
    eixos: eixos,
    funcao: funcao,
    serie: serie,
    linhaH: linhaH,
    linhaV: linhaV,
    ponto: ponto
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
