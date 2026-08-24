# Interativos de Cálculo 4 — séries de Fourier

Duas visualizações interativas sobre convergência de séries de Fourier, construídas para a
disciplina de Cálculo 4 do ICMC-USP (SMA0356 / SMA0803), para ficarem ao lado das animações em
gnuplot já publicadas na seção de gráficos.

A diferença em relação a uma animação em laço é que o aluno **controla o parâmetro**: dá para
parar num valor, comparar dois números lado a lado e voltar atrás. É o que uma patologia de
convergência exige para ser percebida.

## Como publicar

Não há build step, `npm install`, bundler ou dependência de CDN. Para publicar:

```
copie a pasta inteira para o servidor e aponte um link para index.html
```

É só isso. Funciona em qualquer servidor de arquivos (Apache, nginx, GitHub Pages, `public_html`
de conta institucional) sem nenhuma configuração. Também abre por duplo clique em `index.html`,
sem servidor nenhum, o que é útil para conferir antes de publicar.

Se preferir embutir na sua página em vez de linkar, um `<iframe>` apontando para
`convergencia.html` ou `epiciclos.html` funciona igual.

## Os módulos

### `convergencia.html` — convergência uniforme

Onda triangular contra onda quadrada, com um único slider de `N` controlando as duas.

- **Triangular** (`f(x) = |x|` em `[-1,1]`, `L = 1`): contínua, satisfaz as hipóteses do teorema
  de convergência uniforme. O erro máximo cai a zero — `0,0947` em `N = 1`, `0,00051` em `N = 200`.
- **Quadrada** (`f(x) = π·χ_[0,π)(x)` em `[-π,π]`, `L = π`): descontínua, não satisfaz. Dois
  números diferentes valem a pena aqui:
  - `‖f − S_N‖∞ = π/2`, **exatamente, para todo N**. Toda soma parcial passa pelo ponto médio do
    salto. O erro máximo nunca diminui.
  - O overshoot de Gibbs estaciona em `Si(π) − π/2 ≈ 0,2811`, ou 8,95% do salto.

Mais três identidades das notas convergindo ao vivo, com os dígitos já coincidentes destacados:
`Σ 1/(2n-1)² = π²/8`, `Σ (-1)^{n+1}/(2n-1) = π/4` e `Σ 1/(2n-1)⁴ = π⁴/96`.

### `epiciclos.html` — decaimento em curvas algébricas

Seis curvas fechadas viram `z(t) = x(t) + i y(t)`; cada termo `f̂(n)e^{int}` é um vetor girando, e
a soma truncada é uma cadeia de círculos cuja ponta desenha a curva.

O corolário demonstrado em aula — se `f` tem `k` derivadas então `n^k f̂(n) → 0` — é qualitativo.
Aqui a taxa é medida por mínimos quadrados em `(log n, log|f̂(n)|)` e conferida contra
singularidades conhecidas:

| Curva | Expoente (em arco) | Sem reparametrizar |
|---|---:|---:|
| Círculo | espectro finito | espectro finito |
| Fermat n=4 | −5,81 | −1,51 |
| Fermat n=10 | −3,17 | −1,21 |
| Lemniscata de Bernoulli | −7,86 | −6,65 |
| Cúbica nodal | −1,94 | −2,08 |
| Astroide | −1,91 | espectro finito |

A última linha é a demonstração central. Na parametrização usual, a astroide é *exatamente*
`z(s) = ¾e^{is} + ¼e^{-3is}` — dois círculos reconstroem quatro cúspides com precisão de máquina.
Reparametrizada por comprimento de arco ela decai como `n^{-2}`, porque na cúspide a tangente se
inverte e em arco isso é um bico. O espectro finito era propriedade da fórmula escolhida, não das
cúspides. Por isso a reparametrização é obrigatória, e o checkbox que a desliga é uma
demonstração por si só.

## Estrutura

```
index.html            porta de entrada, um cartão por módulo
teoria.html           notação e enunciados completos
convergencia.html     módulo 2
epiciclos.html        módulo 1
testes.html           suíte de asserções sobre os módulos matemáticos
css/
  base.css            tokens, tipografia, layout compartilhado
js/
  fourier.js          DFT, Parseval, ajuste log-log        — puro, sem DOM
  curvas.js           as seis curvas e a reparametrização  — puro, sem DOM
  ondas.js            triangular e quadrada, Gibbs         — puro, sem DOM
  plot.js             helpers de canvas: escala, eixos, traçado
  formulas.js         renderização com KaTeX, com plano B
  index.js            miniaturas da página inicial
  convergencia.js     controlador do módulo 2
  epiciclos.js        controlador do módulo 1
  testes.js           as asserções
vendor/
  katex/              KaTeX 0.16.11, hospedado localmente
```

Os três módulos matemáticos (`fourier.js`, `curvas.js`, `ondas.js`) não tocam no DOM: recebem
números e devolvem números. É isso que torna possível testá-los.

## Testes

Abra `testes.html`. São 31 asserções, entre elas:

- a identidade de Parseval fecha em `1,5e-15` nas seis curvas;
- os coeficientes do círculo são todos nulos exceto `n = 1`, dentro de `3,5e-14`;
- a curva reparametrizada tem espaçamento constante em arco;
- as três identidades numéricas convergem para os valores corretos;
- a simetria de ordem 4 da astroide zera todo `n ≢ 1 (mod 4)`, dentro de `1,1e-15`;
- nenhum `NaN`, `Infinity` ou `-0` em nenhuma combinação de controles.

## Duas decisões de implementação que não são óbvias

**A malha densa é adaptativa.** A superelipse de Fermat tem velocidade *infinita* nos quatro
pontos sobre os eixos (`|dz/ds| ~ 0,2·|s|^{-0,8}` para `n = 10`). Numa grade uniforme de 6000
pontos, uma única corda carrega 3% do comprimento da curva, e nenhuma grade uniforme resolve isso
— seriam precisos ~10¹⁰ pontos. Bissetar as cordas longas resolve com algumas centenas de pontos
extras. Sem isso o expoente medido da Fermat n=10 dava −0,15 em vez de −3,17.

**Cosseno e seno com redução exata de quadrante.** `Math.sin(2π)` devolve `-2,4e-16`. Inofensivo
num círculo, mas a Fermat n=10 eleva esse resíduo a `1/5` e o transforma em `7,5e-4` — a curva
deixava de fechar de forma visível.

## Uma observação sobre as notas

No exemplo da onda quadrada, as notas dizem que `f(x) = π·χ_[0,π)(x)` em `[-π,π]` se estende a uma
função "2-periódica". Com `L = π` a extensão é `2π`-periódica, e a série apresentada logo em
seguida de fato tem período `2π`. Parece ser só um lapso de digitação. O código está implementado
com período `2π`, que é o correto.

## Restrições respeitadas

Site estático puro, sem build step nem dependência de CDN. Todo desenho é `<canvas>` 2D escrito à
mão — nenhuma biblioteca de gráficos. Sem `localStorage`, sem `<form>`, sem `position: fixed`.
Interface inteiramente em português do Brasil. Responsivo até 380px, navegação por teclado com
foco visível, `aria-label` nos canvas, e `prefers-reduced-motion` respeitado: com motion reduzido
a animação dos epiciclos não roda sozinha, e o usuário avança pelo slider de posição.
