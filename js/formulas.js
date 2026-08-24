/* formulas.js — renderização de fórmulas com KaTeX.
 *
 * Uso: marque o elemento com data-math="..." (em linha) ou
 * data-math-display="..." (em bloco) e chame Formulas.renderizar().
 *
 * Se o KaTeX não carregar — CDN fora do ar não é o caso, porque ele está em
 * vendor/, mas um arquivo faltando ou um navegador bloqueando fonte local é —
 * a página cai para o texto cru em monoespaçada em vez de deixar buracos.
 * Registra-se em globalThis.Formulas.
 */
(function (global) {
  'use strict';

  function disponivel() {
    return typeof global.katex !== 'undefined' && typeof global.katex.render === 'function';
  }

  function renderizarNo(no) {
    var display = no.hasAttribute('data-math-display');
    var src = display ? no.getAttribute('data-math-display') : no.getAttribute('data-math');
    if (src === null || src === undefined) return false;
    if (disponivel()) {
      try {
        global.katex.render(src, no, { displayMode: display, throwOnError: false });
        return true;
      } catch (e) { /* cai no plano B */ }
    }
    no.textContent = src;
    no.className += (no.className ? ' ' : '') + 'formula-crua';
    return false;
  }

  /* Renderiza tudo que estiver marcado dentro de `raiz` (padrão: o documento).
   * Devolve { total, renderizadas }. */
  function renderizar(raiz) {
    var base = raiz || global.document;
    var alvos = base.querySelectorAll('[data-math], [data-math-display]');
    var n = 0;
    for (var i = 0; i < alvos.length; i++) {
      if (renderizarNo(alvos[i])) n++;
    }
    return { total: alvos.length, renderizadas: n };
  }

  global.Formulas = {
    disponivel: disponivel,
    renderizar: renderizar,
    renderizarNo: renderizarNo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
