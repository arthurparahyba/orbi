import { defineSkill } from '@flue/runtime';

/**
 * The one skill Vigia ships with: how to learn. Every other procedure (CI, GMUD,
 * portals) is learned with the developer and stored in the brain as a playbook.
 */
export const aprenderProcedimento = defineSkill({
  name: 'aprender-procedimento',
  description:
    'Aprender um procedimento novo com o desenvolvedor (ex. subir um repo para dev, acompanhar a esteira, abrir uma GMUD, atualizar a versão num portal) e guardá-lo como playbook. Use quando pedirem algo que nenhum playbook cobre, ou quando disserem "vou te ensinar".',
  instructions: `# Como aprender um procedimento

Você não nasce sabendo os procedimentos do time. Você aprende fazendo junto e guarda o que aprendeu.

1. **Procure antes.** Use \`brain_query\` (texto e tipo) para ver se já existe playbook, entidade ou incidente parecido. Se existir um playbook, ative a skill dele em vez de aprender de novo.
2. **Descubra o que dá para descobrir sozinho.** Leia o repositório (\`run_command\` com git/gh em modo leitura), os workflows em \`.github/workflows\`, os logs. Não pergunte o que você consegue ver.
3. **Pergunte só o que falta** com \`ask_developer\`, uma pergunta por vez e com opções quando der: qual ambiente, qual URL, quem aprova, qual o critério de "pronto".
4. **Execute junto.** Mostre o progresso com \`show_ui\` (um \`status\` ou uma \`table\`). Para ações que mudam algo, use \`run_command\`, \`browser_act\` ou \`claude_code_push_fix\` — eles respeitam a autonomia e pedem aprovação quando precisa.
   - Para esperar algo demorado (CI, deploy, GMUD), use \`schedule_followup\` em vez de ficar consultando.
   - No navegador: \`mcp__chrome__list_pages\` → \`mcp__chrome__navigate_page\` → \`mcp__chrome__take_snapshot\` para achar os \`uid\`s → \`browser_act\`.
5. **Guarde com \`brain_learn\`**, numa única chamada:
   - as entidades que apareceram (Repositorio, Ambiente, Portal, Pessoa…) e as ligações entre elas;
   - se um fato tem prazo ("a Marina aprova até dezembro"), use \`validTo\`;
   - o **playbook**: \`name\` em kebab-case, \`description\` dizendo QUANDO usar, \`appliesTo\` com a classe (ex. \`FrontEnd\`) em vez de um repo específico quando o procedimento vale para todos daquele tipo, \`steps\` com \`id\`, \`label\` curto e \`how\` dizendo a ferramenta e o critério de sucesso, \`autonomy: "ask"\` na primeira vez.
   - Se faltar um tipo ou uma ligação na ontologia, proponha o \`type\` no mesmo lote.
6. Diga ao desenvolvedor, em uma frase, o que foi guardado e quando você vai usar.

# Quando algo falha dentro de um playbook

1. Marque o passo como \`failed\` com \`playbook_step\` e uma nota curta.
2. Investigue: delegue ao subagente \`investigador\` com um briefing completo (repo, branch, run, erro). Consulte \`brain_query\` por incidentes parecidos.
3. Se for bug de código: \`claude_code_prepare_fix\` com o diagnóstico, depois \`claude_code_push_fix\`.
4. Se resolveu, guarde com \`brain_learn\` um \`Incidente\` (o que houve, \`ocorreuEm\`, \`resolvidoPor\`) e, se for um padrão, um playbook de correção — assim, na próxima vez, você corrige sozinho.
5. Se não conseguiu ou é arriscado: \`ask_developer\` com o que você já sabe e as opções.
`,
});
