# Contribuindo

Este é um site estático de módulos interativos para Cálculo 4 (SMA0356 / SMA0803, ICMC-USP).
Não há build step, bundler nem `npm install`: clonar, abrir `index.html` e já está rodando.

## Antes de escrever código

Abra **`testes.html`** e confirme que a suíte está toda verde. Ela é a rede de segurança do
projeto: os módulos matemáticos são puros — recebem números e devolvem números, sem tocar no
DOM — justamente para poderem ser testados assim.

## Como o projeto se divide

```
js/fourier.js      DFT, Parseval, ajuste log-log        \
js/curvas.js       as seis curvas e a reparametrização   |
js/ondas.js        triangular e quadrada, Gibbs          |  puros: sem DOM,
js/polinomios.js   recorrências, raízes, raio            |  testáveis
js/iteracao.js     pontos fixos, órbitas, teia           |
js/difusao.js      calor e onda em série, Parseval       |
js/reordenacao.js  rearranjos de séries alternadas       |
js/formato.js      número em português, para a tela     /

js/plot.js         helpers de canvas: escala, eixos, traçado
js/formulas.js     renderização com KaTeX, com plano B

js/<modulo>.js     um controlador por página: só amarra os módulos ao DOM
```

Regra prática: **se a função pode ser testada com números, ela não pertence ao controlador.**
Coloque em um módulo puro e escreva a asserção.

Quando um módulo novo precisar de algo de `plot.js`, **faça a função existente crescer** em vez
de duplicar o desenho dentro do controlador. Foi assim que `escalaIsometrica` saiu de
`epiciclos.js` para `plot.js` quando o plano complexo do módulo 4 passou a precisar dela, e foi
assim que a formatação de número virou `formato.js` quando o segundo controlador precisou
escrever `1,88 × 10¹¹⁰` sem repetir a tabela de algarismos sobrescritos.

## Restrições que não são negociáveis

- **Site estático puro.** HTML, CSS e JavaScript. Sem build, sem bundler, sem framework.
- **Sem dependência externa por CDN.** A única biblioteca é o KaTeX, hospedado em
  `vendor/katex/` para o site funcionar offline.
- **Sem biblioteca de gráficos.** Todo desenho é `<canvas>` 2D escrito à mão.
- **Sem `localStorage`, sem `<form>`, sem `position: fixed`.**
- **Português do Brasil** em toda a interface, inclusive nos nomes de variáveis e comentários.
- **Nada de `NaN`, `Infinity` ou notação exponencial crua na tela**, em nenhum caminho.
  Todo número exibido passa por `formato.js`. Note que `toFixed` sozinho **não** basta: acima
  de `1e21` ele volta a devolver `"1e+22"`, e `isFinite(null)` é `true`. As duas armadilhas têm
  asserção na suíte.
- Acessível: foco de teclado visível, `aria-label` nos canvas, e `prefers-reduced-motion`
  respeitado — com motion reduzido nenhuma animação começa sozinha.
- Responsivo até 380px de largura.

## Anatomia de um módulo

Cada página segue a mesma estrutura, e vale manter:

1. **Navegação** e cabeçalho com o número do módulo.
2. **A crença falsa** que o módulo desfaz, em citação, logo abaixo do título, sempre com o
   rótulo “A crença que este módulo desfaz” em cima. Ela é o gancho: diz ao aluno o que ele
   provavelmente pensa de errado, antes de mostrar o contrário. O rótulo não é decoração —
   é o que impede a frase de ser lida como afirmação da página. Por isso ela vive aqui, onde
   a refutação vem logo em seguida, e não no cartão da página inicial.
   O filete e o rótulo usam `--crenca`, e **não** `--grafico-limite`: aquele token marca o
   limite teórico nos gráficos, que é um valor correto, e os avisos de verdade. A frase
   citada fica em cinza — quem carrega o sentido é o rótulo, não a cor.
3. **Dois ou três parágrafos** enunciando a matemática em jogo, na notação da disciplina.
   O texto ancora; a animação ilustra. Sem texto, vira videogame.
4. **Controles**, depois **canvas**, depois **indicadores numéricos**.
5. Uma seção final explicando o que se vê na tela e por quê.

## Ideias de módulo para quem quiser começar

**Simetria dos coeficientes de Fourier** — baseado nas questões `quadrada-pw-pequeno` e
`fourier-inverted-spike`.

A ideia: uma função definida por partes, com o **ponto de quebra arrastável**. Conforme o ponto
se move, a função passa por posições em que fica par ou ímpar em relação ao centro do intervalo,
e o aluno vê as famílias inteiras de coeficientes **se anularem em tempo real** — todos os `b_k`
somem quando a função é par, todos os `a_n` (menos `a_0`) somem quando é ímpar.

Por que é um bom primeiro módulo:

- A matemática é curta: reaproveita `fourier.js`, que já calcula tudo de que precisa.
- O desenho é um gráfico de barras dos coeficientes, mais simples que qualquer canvas existente.
- A crença falsa é clara: *“anular metade dos coeficientes é coincidência da conta.”* Não é —
  é simetria, e dá para **ver** a simetria acontecer.
- A interação acrescenta algo que um gráfico estático não dá: a passagem contínua entre os
  regimes, com os coeficientes reagindo.

Sugestão de arquivos: `simetria.html`, `js/simetria.js`, e as funções puras dentro de
`js/fourier.js` ou de um módulo puro novo — o que couber melhor. A convenção dos módulos 5 e 6
é essa: o arquivo puro leva o nome do assunto (`difusao.js`, `reordenacao.js`) e o controlador
leva o nome da página (`calor.js`, `rearranjo.js`).

**Troca de limites** — a segunda ideia da fila, e a que cobre o bloco de sequências de funções,
hoje sem módulo. A família `f_n(x) = 2n·x·e^{-n x²}` em `[0,1]` converge pontualmente a zero,
mas `∫ f_n → 1`: o limite não comuta com a integral. Um segundo controle sobre o expoente do
peso atravessa o limiar em que o teorema passa a valer, e é a travessia — não os dois lados —
que a interatividade acrescenta.

## Ao terminar

1. `testes.html` verde, com asserções novas cobrindo o que você acrescentou.
2. Módulo registrado em `index.html`: um cartão com miniatura e o parágrafo que descreve o
   módulo. **A crença falsa não vai no cartão.** Ela só funciona ao lado da refutação: solta
   na página inicial, entre aspas e sem rótulo, é uma afirmação falsa que o aluno lê primeiro
   e pode guardar como verdadeira.
3. Linha nova no **índice por exercício**, se o módulo responde alguma questão.
4. Navegação atualizada em todas as páginas.
5. Confira em tela estreita e com o teclado, sem mouse.
