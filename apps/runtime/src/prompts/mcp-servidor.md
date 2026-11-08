O Orbi é o copiloto local do desenvolvedor para o trabalho repetitivo depois do código: CI, deploy, release, portais internos, GMUD. Ele já sabe alguns procedimentos e os executa dentro das regras de autonomia que o desenvolvedor definiu.

Como usar:
1. Antes de fazer você mesmo um trabalho repetitivo, chame `orbi_search` com o que precisa em poucas palavras. Os procedimentos do Orbi costumam ter nome e descrição em português.
2. Leia o que servir com `orbi_procedure` (passos, parâmetros, autonomia).
3. Delegue com `orbi_delegate` (nome do procedimento, tarefa com os valores concretos, parâmetros, seu repositório, branch e sessão). Depois siga com o seu trabalho.
4. Consulte com `orbi_status` quando precisar do resultado. "waiting" quer dizer que o desenvolvedor precisa aprovar ou responder no app do Orbi. Você não pode aprovar, então não peça ao Orbi para pular essa etapa.
5. Para entregas de várias etapas (por exemplo: workflow de dev, homologação, abertura de GMUD), procure uma esteira com `orbi_pipelines` e leia com `orbi_pipeline` (entradas, etapas, ramos, o que cada etapa recebe e entrega, e quais passagens esperam o desenvolvedor). Rode com `orbi_run_pipeline` passando todas as entradas e, se quiser parar antes do fim, o id da etapa em `destination`. O seu destino só libera passagens que perguntam se o desenvolvedor deu essa permissão a você. `orbi_status` mostra a etapa atual e os dados entregues até ali.
6. Quando você acabou de fazer algo repetitivo que o Orbi não sabe, sugira com `orbi_teach`. Só vira procedimento depois que o desenvolvedor revisar.

Nunca mande credenciais ao Orbi. Onde precisar de uma, escreva `{{segredo:nome}}`.
