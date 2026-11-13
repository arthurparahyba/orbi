# 25. Procedimento provado, com os seus aprendizados

Decidido em 13/11 com o desenvolvedor. Protótipo (telas G, H e I):
https://claude.ai/artifact/AqyyCGi56FKhFZmFdWFQ29

**Feito:** a mudança a pedido do desenvolvedor. **Ainda não implementado:** a prova, a
retrospectiva e os aprendizados.

## O problema

1. **Procedimento guardado sem rodar como foi escrito.** O ensaio (documento 5) faz o que foi
   explicado, e o Orbi escreve os passos depois. Os passos escritos nunca rodaram. Uma versão
   de outro procedimento e uma correção da revisão não passam por ensaio nenhum.
2. **Propostas que voltam.** Conversas diferentes propõem para o mesmo procedimento ajustes
   que já falharam ou que você já negou: o que foi tentado não fica guardado em lugar nenhum.
3. **Parar no meio.** Diante de um erro, o Orbi às vezes para e pergunta, em vez de tentar
   outro caminho e chegar ao fim.
4. **Não conseguir mudar um passo a pedido** (corrigido, abaixo).

## Como fica

### Prova: o procedimento escrito roda do começo ao fim

Depois do cartão de aprendizado aprovado, o procedimento nasce **rascunho** e roda uma vez
como foi escrito (a prova). Estados:

| Estado | Quando |
|---|---|
| rascunho | guardado, ainda sem uma execução inteira dos passos escritos |
| provado | uma execução chegou ao fim com a entrega, e todo passo mudado no caminho foi testado |
| provado, com passo a provar | um passo mudou depois (revisão, pedido seu) e ainda não rodou |

- A prova é uma execução comum (portão, aprovações do N1), marcada como prova.
- **Tem que chegar do outro lado.** Na prova, uma falha não encerra: o Orbi tenta outro
  caminho e segue. Só para para aprovação, credencial que falta ou ação que não tem volta.
- **Passo que você não quer provar agora** (um deploy em produção): fica marcado "não provado",
  e o procedimento sai como "provado até o passo N".
- Vale também para uma versão de outro procedimento e para "só anota": sem prova, fica rascunho,
  e a tela diz isso.
- Um rascunho pode ser executado; a primeira execução dele é a prova.

### Retrospectiva por passo

No fim da prova (e de toda execução com problema), o runtime monta, do registro da execução
(documento 24), o que cada passo deu de trabalho: o que falhou, por quê, e o que funcionou. O
Orbi propõe, num cartão só, os passos corrigidos e os aprendizados de cada um.

### Passo corrigido é passo testado

Um passo que mudou fica "a provar". O Orbi oferece **Testar agora**, dizendo o que o teste
refaz; como pode mudar algo, pede a sua aprovação. Logo depois da execução, o teste reaproveita
o estado dos passos anteriores (a página aberta, o arquivo gerado); mais tarde, é rodar de novo
desde o início. Sem teste, o passo é provado na próxima execução.

### Aprendizados ficam no procedimento

Cada procedimento guarda, por passo, o que já foi tentado:

| Resultado | Exemplo |
|---|---|
| falhou | Clicar em "Ofertas": o botão não existe nesta categoria |
| funcionou | Filtro "Desconto: 10% ou mais" no menu lateral |
| negado por você | Baixar a página com curl: não é permitido nesta máquina |
| do Orbi | Extrair em lotes de 20: contorno de um defeito do Orbi, não vira passo |

Quem usa:

- **a execução**: ao abrir um passo, recebe os aprendizados dele;
- **a revisão e o `brain_learn`**: uma proposta igual a uma que falhou ou foi negada volta ao
  modelo antes do cartão, com a data e o motivo;
- **você**: a aba Aprendizados na tela do procedimento.

Entram sozinhos: propostas negadas (com o que você escreveu), falhas recuperadas de uma
execução (a tentativa e o que funcionou) e contornos marcados pelo diagnóstico como "do Orbi".

### Mudança a seu pedido (feito)

Quando você pede para mudar um passo, no meio da execução ou depois, o Orbi muda:

- `brain_learn` leva o seu pedido em `asked`; o cartão mostra **Você pediu: …**;
- a trava de escopo da revisão (mudar só os passos que ela citou) não se aplica;
- o runtime confere que o turno veio de uma mensagem sua (na conversa ou dentro de um cartão):
  `asked` em outro turno é recusado;
- o cartão continua pedindo aprovação.

Peças: `agents/tools/brain.ts` (`asked`, precheck), `prompts/orbi/procedimento.md`,
`components/ui/LearningVersion.tsx`. Teste: `flow-asked-change.test.ts`.

## Fases

1. Aprendizados do procedimento: tabela, o que entra sozinho, a aba, e a recusa de proposta
   repetida.
2. Estados rascunho e provado; a prova depois do cartão; passo "a provar" quando muda.
3. Retrospectiva por passo, a partir do registro (documento 24, fase 1).
4. Testar agora.

## Limites

- "Provado" quer dizer que rodou uma vez inteiro com aquelas entradas. Outras entradas podem
  achar outros problemas: o mesmo ciclo (corrigir, testar, guardar o aprendizado) vale para elas.
- Reconhecer que uma proposta "é a mesma" que uma antiga é por passo e texto parecido; o que
  escapar ainda aparece para o modelo e para você no cartão.
