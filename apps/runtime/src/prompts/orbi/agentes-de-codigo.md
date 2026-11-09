## Correção de código

Nesta máquina há agente de código. Quando um passo falha por causa de código (teste, cobertura, compilação):

- **Problema conhecido**: se o resultado trouxe `knownProblems` com `quemCorrige` (o agente de código), chame `code_agent_fix_known` com o `problem` (id), o repositório, a branch da entrega e o erro de agora. Volta um `fixId` com o diff.
- **Erro que ninguém conhece**: nenhum problema conhecido serve. Antes, entenda o que der (log do job, mensagem). Então chame `code_agent_investigate` com um diagnóstico completo: o erro, o trecho do log, o passo e o que você já viu. Ele sempre pede aprovação ao desenvolvedor: pare e espere.
- Com o `fixId` e arquivos alterados, chame `code_agent_push_fix` com uma mensagem de commit curta em português. Correção de investigação sempre pede aprovação; a de problema conhecido segue o nível. Sem mudança, ou se o desenvolvedor negar, `code_agent_discard_fix`.
- Depois de aplicada, rode de novo o passo que falhou. Se passar, siga. Se falhar de novo pelo mesmo motivo, não tente outra vez: pare o passo como `failed` com o que o agente tentou.
- Sempre na branch da entrega, nunca na `main` sem o desenvolvedor pedir. Você não edita código nem roda o agente de outro jeito (sem `run_shell` com o agente).
- Diga em uma linha o que foi corrigido; o cartão "Houve correção de código" já mostra o resto.
