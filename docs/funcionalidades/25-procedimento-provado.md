# 25. Procedimento provado, com os seus aprendizados

Decidido em 13/11 com o desenvolvedor. Protótipo (telas G, H e I):
https://claude.ai/artifact/AqyyCGi56FKhFZmFdWFQ29

**Feito:** a mudança a pedido do desenvolvedor, os aprendizados do procedimento, a prova por passo
e a retrospectiva da execução. **Ainda não implementado:** o "Testar agora", que roda um passo
sozinho reaproveitando o estado dos anteriores.

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
como foi escrito (a prova). A prova é **por passo**: um passo está provado enquanto a instrução
que rodou ainda é a instrução que ele tem. Por isso corrigir um passo tira a prova dele sozinho,
sem ninguém precisar marcar nada, e o procedimento volta a pedir para rodar.

| Estado | Quando |
|---|---|
| rascunho | nenhum passo rodou como está escrito |
| parcial | alguns passos provados; falta provar os outros (um mudou na revisão ou a seu pedido) |
| provado | todos os passos provados, ou dispensados por você |

Um passo só é provado quando é fechado como `done` numa execução de verdade (não num ensaio) e
não ficou nele nenhuma falha sem recuperação: um passo que só terminou porque o Orbi achou outro
caminho não está provado, porque as palavras dele continuam não funcionando.

- A prova é uma execução comum (portão, aprovações do N1): o `playbook_start` avisa, em `prova`,
  que esta execução prova os passos.
- **Tem que chegar do outro lado.** Na prova, uma falha não encerra: o Orbi tenta outro
  caminho e segue (está na skill de aprender e na de corrigir). Só para para aprovação,
  credencial que falta ou ação que não tem volta.
- **O cartão não é o fim.** O `brain_learn` responde, na mesma hora, que o procedimento ficou em
  rascunho e manda rodar com `playbook_start`; o cartão também diz isso antes de você aprovar.
- **Passo que você não quer provar agora** (um deploy em produção): o botão "Não provar" na tela
  do procedimento dispensa aquele passo, e a tela passa a dizer "provado · você dispensou o
  passo N". "Voltar a provar" desfaz.
- Vale também para uma versão de outro procedimento e para "só anota": sem prova, fica rascunho,
  e a tela diz isso.
- Um rascunho pode ser executado; a primeira execução dele é a prova.

### Retrospectiva por passo

No fim de toda execução com problema, o runtime monta, do registro da execução (documento 24), o
que cada passo deu de trabalho: as chamadas que falharam naquele passo, com a primeira linha do
erro, e o que funcionou depois no mesmo passo. Isso vai no pedido de mudança da revisão ("Nesta
execução: passo 2 · Extrair: browser_act falhou…; depois funcionou com run_command"), para a
correção ser escrita do que aconteceu e não da memória do modelo. O Orbi propõe, num cartão só,
os passos corrigidos e os aprendizados de cada um.

### Passo corrigido é passo testado

Um passo que mudou fica "a provar", e isso aparece na tela e no `brain_learn`. **Feito:** a skill
de corrigir manda oferecer rodar de novo numa linha, e não dizer que está resolvido antes disso;
a próxima execução prova o passo.

**Ainda não feito, o "Testar agora":** refazer só aquele passo, sem rodar o procedimento inteiro.
Logo depois da execução daria para reaproveitar o estado dos passos anteriores (a página aberta,
o arquivo gerado); mais tarde, é rodar de novo desde o início. Como pode mudar algo, pediria a
sua aprovação dizendo o que o teste refaz.

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
- **a revisão**: recebe o histórico junto com o pedido de mudança, para propor outra coisa;
- **você**: a aba Aprendizados na tela do procedimento.

Como entram (feito):

- **proposta negada**: cada passo que a versão negada mudaria vira "negado" (`denied` do
  `brain_learn`, pelo portão);
- **execução**: no fim, o que falhou num passo que mesmo assim terminou feito vira "falhou"
  (`failedAttempts`, na revisão). Deslize corrigido pela mesma chamada e chamada errada do
  modelo não entram;
- **cartão aprovado**: o Orbi conta em `learnings`, no item do procedimento, o que a execução
  tentou e o que funcionou; o cartão mostra, e aprovar guarda;
- a mesma tentativa com o mesmo resultado é contada ("vista 2 vezes"), não repetida.

Ainda não entra sozinho: o contorno "do Orbi" (depende do diagnóstico, documento 24).

Como são usados (feito): `playbook_start` devolve `jaTentado`, e a instrução da revisão traz o
que já foi tentado. **Nada é recusado por causa do histórico** (decisão de 13/11): quem revisa
e propõe recebe o histórico e é quem decide tentar outra coisa; o `brain_learn` só aprende. Na
tela do procedimento, a seção **Aprendizados**, por passo, com **Tirar**.

Peças: `brain/domain/step-learnings.ts`, `brain/repo/step-learnings.ts` (tabela
`playbook_learnings`), `http/routes/step-learnings.ts`, `views/brain/PlaybookLearnings.tsx`.
Testes: `step-learnings.test.ts`, `flow-step-learnings.test.ts`, `learnings.test.ts` (app).

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

1. ~~Aprendizados do procedimento: tabela, o que entra sozinho e a seção na tela.~~ Feito.
2. ~~Estados rascunho, parcial e provado; a prova por passo; passo "a provar" quando muda.~~ Feito.
3. ~~Retrospectiva por passo, a partir do registro (documento 24, fase 1).~~ Feito.
4. Testar agora.

## Peças

Regras puras em `brain/domain/proofs.ts` (a prova por passo, o estado, a linha que você lê, o que
o Orbi é mandado fazer) e em `review/retrospective.ts`; tabela em `brain/repo/proofs.ts`
(`playbook_proofs`); a prova é gravada em `brain/services/execution.ts` quando o passo fecha;
`agents/tools/brain.ts` responde o que falta provar, `agents/tools/playbooks.ts` avisa a execução;
rotas em `http/routes/brain.ts` (`GET /api/brain/proofs`, dispensar um passo); tela em
`views/brain/PlaybookProofPill.tsx`; skills `aprender-procedimento.md` e
`corrigir-procedimento.md`.

Testes: `proofs.test.ts`, `flow-proof.test.ts`.

## Limites

- "Provado" quer dizer que cada passo rodou uma vez com aquelas entradas. Outras entradas podem
  achar outros problemas: o mesmo ciclo (corrigir, provar, guardar o aprendizado) vale para elas.
- A prova compara o texto do passo (sem diferença de espaços, até mil caracteres). Mudança só de
  pontuação também tira a prova: é o preço de não precisar marcar nada à mão.
- Nada impede rodar um rascunho, e o Orbi não é bloqueado por código: o que o leva a provar é o
  que o `brain_learn` responde e o que a skill manda. Bloquear a execução de um rascunho seria
  pior: às vezes rodar é justamente o que prova.
- O histórico informa, não bloqueia: uma proposta repetida ainda pode aparecer, e você nega no cartão.
