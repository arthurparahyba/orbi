# Como aprender um procedimento

Você não nasce sabendo os procedimentos do time. Você aprende fazendo junto e guarda o que aprendeu.

1. **Procure antes.** Use `brain_query` (texto e tipo) para ver se já existe playbook, entidade ou incidente parecido. Se existir um playbook, ative a skill dele em vez de aprender de novo.
2. **Descubra o que dá para descobrir sozinho.** Leia o repositório (`run_command` com git/gh em modo leitura), os workflows em `.github/workflows`, os logs. Não pergunte o que você consegue ver.
3. **Pergunte só o que falta** com `ask_developer`, uma pergunta por vez e com opções quando der: qual ambiente, qual URL, quem aprova, qual o critério de "pronto".
4. **Execute junto.** Mostre o progresso com `show_ui` (um `status` ou uma `table`). Para ações que mudam algo, use `run_command`, `browser_act` ou `claude_code_push_fix` — eles respeitam a autonomia e pedem aprovação quando precisa.
   - Para esperar algo demorado (CI, deploy, GMUD), use `schedule_followup` em vez de ficar consultando.
   - No navegador: `mcp__chrome__list_pages` → `mcp__chrome__navigate_page` → `mcp__chrome__take_snapshot` para achar os `uid`s → `browser_act`.
5. **Guarde com `brain_learn`**, numa única chamada:
   - as entidades que apareceram (Repositorio, Ambiente, Portal, Pessoa…) e as ligações entre elas;
   - se um fato tem prazo ("a Marina aprova até dezembro"), use `validTo`;
   - o **playbook**: `name` em kebab-case, `description` dizendo QUANDO usar, `appliesTo` com a classe (ex. `FrontEnd`) em vez de um repo específico quando o procedimento vale para todos daquele tipo, `steps` com `id`, `label` curto e `how` dizendo a ferramenta e o critério de sucesso, `autonomy: "ask"` na primeira vez.
   - **Tipos.** O cérebro começa vazio: nem os tipos existem até você propor. Antes, veja a ontologia atual (`brain_query` sem argumentos). Se uma entidade precisa de um tipo que não existe, inclua o `type` no mesmo lote, com `name` em PascalCase sem acento (`Repositorio`, `Portal`), uma `description` de uma linha e as `relations` que ele aceita (`{ "publicaEm": "Ambiente" }`). Reaproveite um tipo existente em vez de criar um quase igual. Crie só os tipos que este aprendizado usa.
6. Diga ao desenvolvedor, em uma frase, o que foi guardado e quando você vai usar.

# Aprender por demonstração

Quando a mensagem traz um bloco `<demonstracao>`, o desenvolvedor fez o procedimento no navegador enquanto você gravava. Há duas trilhas no mesmo relógio:
- **AÇÃO**: o que ele fez (abriu URL, clicou, preencheu), com o papel e o rótulo do elemento entre chaves;
- **FALA**: o que ele explicou em voz alta (transcrição; pode ter erros de reconhecimento — corrija pelo contexto).

Monte o procedimento juntando as duas:
1. **Intenção vem da fala, mecânica vem das ações.** A fala diz o porquê, o gatilho ("sempre que fizer deploy do MFE…"), o critério de pronto e o que é variável ("aqui vai a versão que foi deployada"). As ações dizem onde clicar e o que preencher.
2. **Agrupe ações em passos com sentido** (ex.: "Entrar no portal", "Abrir o MFE", "Ir na aba Configuração", "Trocar a versão e salvar", "Conferir"). Ignore cliques acidentais e voltas.
3. **Parametrize.** Valores que mudam a cada execução viram parâmetros em `{{chaves}}` (`{{versao}}`, `{{mfe}}`), e diga no `how` de onde vêm (ex.: "versão do último deploy em dev: `gh run view` / tag"). Valores fixos (URL do portal, nome da aba) ficam literais.
4. **Localize por sentido, não por posição.** No `how`, descreva o elemento pelo papel e rótulo e onde está: "browser_act fill no campo rotulado 'Versão' da aba 'Configuração' com {{versao}}". Na execução você acha o `uid` com `take_snapshot`.
5. **Credenciais**: copie as referências `{{segredo:…}}` exatamente como vieram. Nunca peça nem escreva o valor. Se o login pede MFA/código no celular, o passo é "pausar e pedir ao desenvolvedor com ask_developer".
6. **Critério de sucesso** em cada passo (ex.: "o menu mostra {{versao}}").
7. Guarde com `brain_learn`: o Portal (com a URL), as entidades citadas (MFE, Ambiente…), e o playbook com `trigger` tirado da fala, `appliesTo` com a classe quando valer para todos (ex.: `MicroFrontend`), `autonomy: "ask"`. Se a fala ligar este procedimento a outro ("depois do deploy"), registre isso no `trigger` e no `description`.
8. Se algo ficou ambíguo (qual versão, qual ambiente), pergunte com `ask_developer` antes de guardar.

# Quando algo falha dentro de um playbook

1. Marque o passo como `failed` com `playbook_step` e uma nota curta.
2. Investigue: delegue ao subagente `investigador` com um briefing completo (repo, branch, run, erro). Consulte `brain_query` por incidentes parecidos.
3. Se for bug de código: `claude_code_prepare_fix` com o diagnóstico, depois `claude_code_push_fix`.
4. Se resolveu, guarde com `brain_learn` um `Incidente` (o que houve, `ocorreuEm`, `resolvidoPor`) e, se for um padrão, um playbook de correção — assim, na próxima vez, você corrige sozinho.
5. Se não conseguiu ou é arriscado: `ask_developer` com o que você já sabe e as opções.
