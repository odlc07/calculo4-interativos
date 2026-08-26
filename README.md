# Módulos Interativos — Cálculo 4 (SMA0356)

Seis visualizações interativas para a disciplina de Cálculo 4 do ICMC-USP
(SMA0356 / SMA0803): duas sobre convergência de séries de Fourier, duas sobre sequências
recursivas e raio de convergência, uma sobre a equação do calor e uma sobre o rearranjo de
séries condicionalmente convergentes.

A diferença em relação a uma animação em laço é que o aluno **controla o parâmetro**: dá para
parar num valor, comparar dois números lado a lado e voltar atrás. É o que uma patologia de
convergência exige para ser percebida.

Os módulos 3 a 6 abrem enunciando uma **crença falsa** — o que o aluno provavelmente pensa de
errado — e existem para desfazê-la. Ela vive na página do módulo, sempre sob o rótulo que a
identifica como crença, e nunca no cartão da página inicial: solta e sem rótulo, uma afirmação
falsa é lida como afirmação da página.

## Como publicar

Não há build step, `npm install`, bundler ou dependência de CDN. Para publicar:

```
copie a pasta inteira para o servidor e aponte um link para index.html
```

É só isso. Funciona em qualquer servidor de arquivos (Apache, nginx, GitHub Pages, `public_html`
de conta institucional) sem nenhuma configuração. Também abre por duplo clique em `index.html`,
sem servidor nenhum, o que é útil para conferir antes de publicar.

Se preferir embutir na sua página em vez de linkar, um `<iframe>` apontando para qualquer um dos
módulos funciona igual.

## Os módulos

### `epiciclos.html` — decaimento em curvas algébricas (módulo 1)

Seis curvas fechadas viram `z(t) = x(t) + i y(t)`; cada termo `f̂(n)e^{int}` é um vetor girando, e
a soma truncada é uma cadeia de círculos cuja ponta desenha a curva.

O corolário demonstrado em aula — se `f` tem `k` derivadas então `n^k f̂(n) → 0` — é qualitativo.
Aqui a taxa é medida, e a página ainda verifica **se a lei ajustada é a lei certa**:

| Curva | previsto | expoente medido | modelo que vence | sem reparametrizar |
|---|---|---:|---|---:|
| Círculo | espectro finito | — | espectro finito | espectro finito |
| Fermat n=4 | exponencial | −5,81 | indeciso | −1,51 |
| Fermat n=10 | exponencial | −3,17 | indeciso | −1,21 |
| Lemniscata | exponencial | −7,86 | **exponencial** | −6,65 |
| Cúbica nodal | `n⁻²` | −1,94 | lei de potência | −2,08 |
| Astroide | `n⁻²` | −1,91 | lei de potência | espectro finito |

Duas demonstrações centrais. A **lemniscata** é analítica, então seus coeficientes decaem como
`e^{-cn}`, não como potência: o expoente `−7,86` é uma reta forçada sobre algo que não é reta, e
a página marca isso em vermelho. E a **astroide** sem reparametrização é *exatamente*
`z(s) = ¾e^{is} + ¼e^{-3is}` — dois círculos reconstroem quatro cúspides com precisão de máquina.
Em arco ela decai como `n^{-2}`, porque na cúspide a tangente se inverte e isso é um bico. O
espectro finito era propriedade da fórmula escolhida, não das cúspides.

### `convergencia.html` — convergência uniforme (módulo 2)

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

### `teia.html` — diagrama de teia (módulo 3)

> *"O limite de uma sequência recursiva depende do valor inicial."*

Dada `g` e um `a₀`, a sequência é `a_{n+1} = g(a_n)`. O diagrama alterna segmentos verticais até
a curva e horizontais até a diagonal. **Arraste `a₀` pelo domínio inteiro** de `√(6+x)` e o
limite não se move: sempre 3. É a resposta da questão, obtida sem conta nenhuma.

| `g(x)` | pontos fixos | `g′(p)` | classe |
|---|---|---:|---|
| `√(6+x)` | 3 | 0,1667 | atrator |
| `cos x` | 0,739085 | −0,6736 | atrator |
| `x²` | 0 · 1 | 0 · 2 | atrator · repulsor |
| logística `r=3,2` | 0 · 0,6875 | 3,2 · −1,2 | repulsor · repulsor |
| logística `r=2,8` | 0 · 0,642857 | 2,8 · −0,8 | repulsor · atrator |

O ponto alto é a **raiz espúria**. Elevar `√(6+x) = x` ao quadrado dá `x² − x − 6 = 0`, de raízes
`3` e `−2`. Mas `g(−2) = √4 = 2 ≠ −2` — a raiz quadrada é não negativa. O gráfico marca `−2` com
um `×` sobre a diagonal, onde o ponto fixo estaria, e um traço pontilhado mede o vão até onde `g`
realmente passa. É esse vão que mostra que as curvas não se cruzam ali.

Com `|g′(p)| = 1` a página diz **inconclusivo**, não chuta. E `a₀ < −6` produz a mensagem
*"a órbita saiu do domínio de g"*, nunca `NaN`.

### `geratriz.html` — da recorrência ao raio (módulo 4)

> *"Raio de convergência é o número que sai do teste da razão, e não significa mais nada."*

A função geratriz de uma recorrência linear é racional: `f = P/Q` com `Q = 1 − c₁x − c₂x²`. O raio
é `R = min{|z| : Q(z) = 0}` — a distância até a singularidade complexa mais próxima — e essa mesma
singularidade dita a taxa de crescimento da sequência.

| exemplo | `P` | `Q` | raízes | `R` | `αₙ₊₁/αₙ` |
|---|---|---|---|---:|---:|
| `seqrecursiva` | `1` | `1−x−2x²` | ½, −1 | **1/2** | 2 |
| `seqrecursiva-2` | `1−x` | `1−2x−3x²` | ⅓, −1 | **1/3** | 3 |
| Fibonacci | `1` | `1−x−x²` | 0,618, −1,618 | 1/φ | φ |
| periódica | `1+x` | `1+x²` | ±i | 1 | **não existe** |

A raiz em `−1` aparece nos dois casos de prova e **não** determina o raio, por estar mais longe da
origem: é o mal-entendido que o plano complexo desfaz. No exemplo periódico as duas raízes têm o
mesmo módulo, a razão oscila entre `+1` e `−1`, e a página **não desenha reta de limite** — ela
detecta a ausência de raiz dominante sozinha, comparando os módulos com tolerância de `1e-9`.

Esta é a versão discreta da tese do módulo 1, e as duas páginas se citam: lá a singularidade
complexa governa a velocidade de *decaimento* dos coeficientes; aqui, a de *crescimento* da
sequência.

### `calor.html` — a equação do calor (módulo 5)

> *"O calor só espalha o que já estava lá: se a temperatura inicial tem um salto, a solução
> continua tendo um salto."*

Num anel de comprimento `2L` com `L = π`, cada modo separa e vira uma EDO em `t`:

| equação | fator | destino |
|---|---|---|
| calor `u_t = α u_xx` | `e^{-α n² t}` | gaussiana em `n`: mata a cauda mais rápido que qualquer potência |
| onda `u_tt = c² u_xx` | `cos(c n t)` | módulo ≤ 1, não decai: volta exata em `t = 2π` |

A solução é **exata** — sem diferença finita, sem passo de tempo —, e o único erro é o
truncamento, medido por Parseval como no módulo 1. Os coeficientes das quatro condições
iniciais estão em forma fechada, sem DFT: não há aliasing, e a cauda do espectro fica exata
até onde se queira somar.

O indicador central responde *quantos harmônicos* bastam para erro relativo abaixo de `1e-6`:

| `t` | 0 | `1e-5` | `1e-3` | `1e-2` | 0,4 |
|---|---:|---:|---:|---:|---:|
| onda quadrada | mais de 2 000 | 887 | 95 | 31 | 5 |

Em `t = 0` a resposta verdadeira é da ordem de `10¹²`, e a busca desiste em 2 000 dizendo isso.
A queda de doze ordens de grandeza assim que `t > 0` é o conteúdo do módulo: é o fenômeno de
Gibbs do módulo 2 deixando de existir, e é a tese do módulo 1 — decaimento dos coeficientes é
a mesma coisa que suavidade — lida ao contrário.

Com `t < 0` no calor a série **não converge**, e a página escreve isso em vez de um número: o
problema inverso do calor é mal-posto, e a razão cabe num expoente. A onda, sendo par em `t`,
atravessa o zero sem notar.

### `rearranjo.html` — rearranjo de séries (módulo 6)

> *"Somar é comutativo: os mesmos números, em outra ordem, dão a mesma soma."*

O aluno escolhe um número e o rearranjo guloso da harmônica alternada converge para ele. Dois
valores fechados sustentam o módulo:

| rearranjo | limite | conferência |
|---|---|---|
| `p` positivos para `q` negativos | `ln 2 + ½·ln(p/q)` | com `1:4`, **exatamente zero** |
| guloso mirando `S` | proporção usada `→ e^{2(S − ln 2)}` | com `S = 3`, ~101 positivos por negativo |

A segunda é a mais bonita: o algoritmo só compara a soma com o alvo a cada passo, não conhece
fórmula nenhuma, e mesmo assim a proporção em que consome as duas listas cai em cima da
previsão — que é a fórmula dos blocos, invertida.

A série `Σ(−1)^{k+1}/k²` é o controle. Absolutamente convergente, todo rearranjo dá `π²/12`
(Dirichlet): mover `p` e `q` não desloca um dígito, e o guloso **trava** — a página mede isso,
declarando travamento quando uma das duas listas não avança nenhuma vez em todo o último quarto
dos termos.

## Estrutura

```
index.html            porta de entrada, um cartão por módulo, índice por exercício
teoria.html           notação e enunciados completos
epiciclos.html        módulo 1
convergencia.html     módulo 2
teia.html             módulo 3
geratriz.html         módulo 4
calor.html            módulo 5
rearranjo.html        módulo 6
testes.html           suíte de asserções sobre os módulos matemáticos
css/
  base.css            tokens, tipografia, layout compartilhado
js/
  fourier.js          DFT, Parseval, ajustes e classificação  — puro, sem DOM
  curvas.js           as seis curvas e a reparametrização     — puro, sem DOM
  ondas.js            triangular e quadrada, Gibbs            — puro, sem DOM
  polinomios.js       recorrências, raízes, raio              — puro, sem DOM
  iteracao.js         pontos fixos, órbitas, teia             — puro, sem DOM
  difusao.js          calor e onda em série, Parseval         — puro, sem DOM
  reordenacao.js      rearranjos de séries alternadas         — puro, sem DOM
  formato.js          número em português, para a tela        — puro, sem DOM
  plot.js             helpers de canvas: escala, eixos, traçado
  formulas.js         renderização com KaTeX, com plano B
  index.js            miniaturas da página inicial
  epiciclos.js        controlador do módulo 1
  convergencia.js     controlador do módulo 2
  teia.js             controlador do módulo 3
  geratriz.js         controlador do módulo 4
  calor.js            controlador do módulo 5
  rearranjo.js        controlador do módulo 6
  testes.js           as asserções
vendor/
  katex/              KaTeX 0.16.11, hospedado localmente
```

Os oito módulos puros (`fourier.js`, `curvas.js`, `ondas.js`, `polinomios.js`, `iteracao.js`,
`difusao.js`, `reordenacao.js`, `formato.js`) não tocam no DOM: recebem números e devolvem
números — ou, no caso do último, texto. É isso que torna possível testá-los. Quem quiser contribuir encontra o resto em [CONTRIBUINDO.md](CONTRIBUINDO.md).

## Testes

Abra `testes.html`. São 67 asserções, entre elas:

- os dois casos de prova do módulo 4 saem exatos, com `P`, `Q`, raízes e raio conferidos;
- o ajuste recupera o parâmetro de espectros sintéticos `A·e^{-0,35n}` e `n^{-2,5}` com `R² = 1`;
- 61 valores iniciais em `√(6+x)` convergem para 3, com desvio máximo de `2,2e-15`;
- BigInt mantém `α₆₀ = 768.614.336.404.564.651` exato, muito além de `2⁵³`;
- a identidade de Parseval fecha em `1,5e-15` nas seis curvas;
- os coeficientes do círculo são todos nulos exceto `n = 1`, dentro de `3,5e-14`;
- a simetria de ordem 4 da astroide zera todo `n ≢ 1 (mod 4)`, dentro de `1,1e-15`;
- a logística com `r = 3,2` cai em ciclo de período 2, detectado automaticamente;
- `|g′| = 1` é classificado como inconclusivo, incluindo `0,999999999999`;
- a onda volta a `u(x, 0)` em `t = 2π` com diferença **exatamente zero**, e é par em `t`;
- no calor, o erro de truncamento com 64 termos cai de 5,6% em `t = 0` para `4,5e-21` em
  `t = 0,01`, e a busca por termos satura em `t = 0` como deve;
- a energia fechada das quatro condições iniciais bate com a soma dos coeficientes em `1e-5`,
  que é o tamanho da cauda além de 400 000 termos;
- o rearranjo `1:4` da harmônica alternada soma zero, e a proporção que o guloso usa bate com
  `e^{2(S−ln2)}` dentro de 0,5% em cinco alvos diferentes;
- reordenar a série absolutamente convergente não move o limite de `π²/12`;
- a formatação nunca emite `NaN`, `Infinity` ou exponencial crua em 600 ordens de grandeza —
  inclusive acima de `1e21`, onde `toFixed` volta a produzir `"1e+22"` sozinho;
- nenhum `NaN`, `Infinity` ou `-0` em nenhuma combinação de controles, nos seis módulos.

## Quatro decisões de implementação que não são óbvias

**A malha densa é adaptativa.** A superelipse de Fermat tem velocidade *infinita* nos quatro
pontos sobre os eixos (`|dz/ds| ~ 0,2·|s|^{-0,8}` para `n = 10`). Numa grade uniforme de 6000
pontos, uma única corda carrega 3% do comprimento da curva, e nenhuma grade uniforme resolve isso
— seriam precisos ~10¹⁰ pontos. Bissetar as cordas longas resolve com algumas centenas de pontos
extras. Sem isso o expoente medido da Fermat n=10 dava −0,15 em vez de −3,17.

**Cosseno e seno com redução exata de quadrante.** `Math.sin(2π)` devolve `-2,4e-16`. Inofensivo
num círculo, mas a Fermat n=10 eleva esse resíduo a `1/5` e o transforma em `7,5e-4` — a curva
deixava de fechar de forma visível.

**Dois modelos de decaimento, não um.** Ajustar uma reta em log-log pressupõe lei de potência.
Curvas analíticas decaem exponencialmente, e a reta passa a medir algo que não existe. O módulo 1
ajusta os dois modelos e compara pelo `R²`, declarando "indeciso" quando a diferença é menor que
`0,02` — em vez de escolher por um fio.

**BigInt no módulo 4, com a divisão antes da conversão.** `α_n` cresce como `(1/R)^n`, então
`Number` estoura em poucas dezenas de passos. A razão `α_{n+1}/α_n` é formada dividindo em BigInt
com escala de `1e18` e só então convertendo: `Number(a)/Number(b)` perderia tudo acima de `2⁵³`.

**As derivadas do módulo 3 são analíticas, não por diferença finita.** O ruído numérico
atrapalharia exatamente onde a classificação decide, perto de `|g′| = 1`.

## Uma observação sobre as notas

No exemplo da onda quadrada, as notas dizem que `f(x) = π·χ_[0,π)(x)` em `[-π,π]` se estende a uma
função "2-periódica". Com `L = π` a extensão é `2π`-periódica, e a série apresentada logo em
seguida de fato tem período `2π`. Parece ser só um lapso de digitação. O código está implementado
com período `2π`, que é o correto.

## Restrições respeitadas

Site estático puro, sem build step nem dependência de CDN. Todo desenho é `<canvas>` 2D escrito à
mão — nenhuma biblioteca de gráficos, nem de álgebra simbólica, nem de raízes de polinômio.
Sem `localStorage`, sem `<form>`, sem `position: fixed`. Interface inteiramente em português do
Brasil. Responsivo até 380px, navegação por teclado com foco visível, `aria-label` nos canvas, e
`prefers-reduced-motion` respeitado: com motion reduzido nenhuma animação roda sozinha, e o
usuário avança pelos sliders.
