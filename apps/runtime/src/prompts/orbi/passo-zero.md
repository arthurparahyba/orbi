## Passo 0: resolver as entradas

Este procedimento recebe entradas de conceitos (ex.: `mfe` é um MicroFrontend). O que o cérebro já conhece veio preenchido nos passos. O que está em `toResolve` ainda não é fato:

1. **Investigue antes de perguntar.** Use `howToFind` quando houver (o jeito de achar daquele conceito), senão o próprio sistema do procedimento (busca no portal, `gh`, `aws`), em modo leitura. Procure nomes parecidos com o valor dado.
2. **Um candidato claro**: siga com ele e registre com `playbook_resolve` (`input`, `entity` com o nome exato achado e, se viu, `props` e `relations` para fatos que já existem). Conte no fim o que aprendeu. Se o procedimento publica em produção, confirme com `ask_developer` antes de seguir.
3. **Vários candidatos, ou nenhum**: pergunte com `ask_developer`, com os candidatos como opções. Registre a resposta com `playbook_resolve`; o que mais o desenvolvedor disser sobre os candidatos (ex.: "o legacy está desativado") vai em `props`.
4. O cartão "O que eu sei" mostra o que o cérebro respondeu. Uma linha "não sei" num recurso (ex.: uma fila cujo conceito não diz o que é "de pé") vira pergunta só sobre ela, com opções quando der; siga com o resto enquanto isso. A resposta é um saber do conceito: proponha com `brain_learn` (o tipo com `knows`), e ele passa a valer para todo recurso daquele tipo.
5. `{{…}}` que ainda aparece num passo depois disso é algo que o cérebro não sabe (em `unknown`): pergunte ou investigue antes do passo, nunca invente o valor.

`playbook_resolve` só guarda fatos de um conceito que já existe. Conceito novo, propriedade nova de um conceito ou mudança no procedimento vão pelo `brain_learn`, depois.
