# 18. Conceitos, fatos e procedimentos (proposta)

> **Estado: proposta, ainda não implementada.** Este documento descreve o que
> muda no cérebro, nos procedimentos e no jeito de aprender, para servir de base à
> implementação. O protótipo das telas está no canvas
> [Procedimentos sobre conceitos](https://claude.ai/artifact/59uBSrE43nJ2waay4HTURM).
> Quando uma parte for implementada, ela sai daqui e entra nos documentos 4, 5 e 8.

## Para que serve

Hoje o Orbi aprende a partir do que você explica e guarda o procedimento quase
como foi dito. Três problemas aparecem com o uso:

1. **Procedimento poluído.** "Atualizar a versão do checkout-mfe 2.14.0 em
   homologação" vira um playbook com `checkout-mfe`, o endereço do portal e o
   usuário dentro dos passos. O próximo MFE vira uma variação, e não deveria.
2. **Aprende sem ter feito.** Uma explicação curta ("entra no portal, clica em
   nova versão…") vira cartão de aprendizado sem ninguém conferir se o botão
   existe, se precisa de credencial, se o login espera aprovação no celular.
3. **A autonomia depende do modelo achar que sabe.** Não há uma forma
   conferível de dizer "isto eu conheço, sigo sozinho" e "isto nunca vi, chamo
   você".

A proposta separa o que o Orbi guarda em três coisas, e muda o aprendizado para
**ensaiar antes de guardar** e **continuar aprendendo fatos ao executar**:

| O quê | Exemplo | Muda com que frequência |
| --- | --- | --- |
| **Conceito** (tipo da ontologia) | MicroFrontend, Portal de deploy, Ambiente, Serviço ECS | Raramente |
| **Fato** (entidade ou ligação) | `checkout-mfe` é um MicroFrontend; o ambiente de homologação usa o profile `pag-hml` | Toda hora, inclusive durante execuções |
| **Procedimento** (playbook) | Atualizar a versão de um MicroFrontend: intenção, entradas e passos que citam propriedades dos conceitos | Só com cartão de aprendizado |

O procedimento diz **o que** fazer e **como**, sempre em termos de conceitos
("conectar no ambiente = AWS CLI com `ambiente.profile`"). Na execução, os fatos
especializam: `ambiente` vira `pagamentos-api/homologação`, `profile` vira `pag-hml`.

## O que já existe e o que muda

Boa parte da base já está no cérebro (documento 4). A proposta estende, não troca.

| Hoje | Depois |
| --- | --- |
| `types`: nome, descrição, `relations`, `requires` | Ganha **propriedades declaradas** (`props`: nome e para que serve) e **saberes** (`knows`: o que é "estar de pé", como conectar, como achar uma instância). É onde mora o "como" que vale para todo o tipo |
| `entities`: id, tipo, propriedades livres, texto | São os **fatos**. Ganham **apelidos** (`aliases`: "xpto" → `xpto-mfe`) e **origem** (`source`: cartão, ensaio ou execução, com a data) |
| `playbooks.appliesTo`: uma classe | Continua, e ganha **entradas tipadas** (`inputs`: `mfe: MicroFrontend`, `ambiente: Ambiente`) |
| `{{parametro}}` nos passos | Também `{{entrada.propriedade}}` e `{{entrada.ligacao.propriedade}}` (`{{mfe.publicadoPor.endereco}}`), conferidos contra o conceito no aprendizado |
| Lacunas: ligação exigida que falta (`findGaps`) | Também **lacunas de execução**: propriedade ou saber que um procedimento usa e o conceito não tem |
| Problema conhecido (`domain/knowledge.ts`) | Continua igual, ligado ao conceito que ele afeta. Serve para a fronteira "conhecido × desconhecido" |
| `prompts/aprender-procedimento.md`: aprender fazendo junto | Reescrito com as fases **entender → ensaiar → combinar → cartão** |
| Cartão de aprendizado: entidades, ligações, procedimento | Separado em **Intenção, Conceitos, Fatos, Procedimento e "Ficou fora do procedimento"** |
| Tela Cérebro → Conhecimento: o grafo inteiro | Mapa de conceitos por padrão; fatos em lista; grafo só por vizinhança |

## Como funciona

### 1. Ensinar é ensaiar

A explicação é o ponto de partida, não o procedimento. O Orbi tenta fazer junto,
conta o que achou e o que não achou, e só no fim propõe o cartão.

```mermaid
sequenceDiagram
  actor Voce as Você
  participant Orbi
  participant Ferramentas as Navegador / terminal
  participant Cofre
  participant Cerebro as Cérebro

  Voce->>Orbi: explicação curta ("pra subir versão do checkout-mfe…")
  Orbi->>Cerebro: o que já sei? (conceitos, fatos, procedimentos parecidos)
  Orbi->>Voce: "vou tentar com você" (modo ensaio)
  loop cada parte da explicação
    Orbi->>Ferramentas: tenta (abre o portal, busca, preenche)
    alt precisa de credencial
      Orbi->>Cofre: ask_secret (formulário, nunca no chat)
    else espera (login com aprovação no celular, deploy)
      Orbi->>Orbi: espera com prazo e avisa
    else não achou
      Orbi->>Voce: onde procurou + o que achou de parecido + pergunta
    end
  end
  Orbi->>Voce: antes de publicar algo: para e pede confirmação
  Orbi->>Voce: combina início, entradas, fim e o que fica de fora
  Orbi->>Voce: cartão de aprendizado (marcado "testado em …")
```

Regras do ensaio:

- **É uma execução de verdade, sem procedimento ainda.** Fica registrada como
  `playbook_runs` com `kind = 'rehearsal'` e sem `playbook`. O histórico de
  comandos, ações e desvios é o mesmo de uma execução normal, e a revisão do fim
  (documento 5) já sabe ler.
- **O que publica sempre pede**, qualquer que seja o nível, mesmo em homologação.
  O Orbi preenche tudo, para antes do clique que publica e mostra o que vai fazer.
- **"Não achei" vem com evidência**: onde procurou e as opções mais parecidas, para
  você escolher em vez de explicar de novo.
- **O que o ensaio corrigiu** entra no cartão como diferença entre a explicação e
  a prática ("nova versão" → Releases › Criar release; "esperar aprovação no
  celular" que você não tinha dito).
- **Combinar início e fim** é obrigatório antes do cartão: quando começa, o que
  precisa receber, quando termina e o que fica de fora (e se quer encadear com
  outro procedimento).
- **Demonstração pelo navegador** (documento 6) já é um ensaio: a gravação conta
  como a tentativa, e o fluxo vai direto para o combinar.

### 2. O procedimento é escrito sobre conceitos

```json
{
  "name": "atualizar-versao-microfrontend",
  "intent": "Publicar uma versão de um MicroFrontend em um ambiente, pelo portal que o publica.",
  "appliesTo": "MicroFrontend",
  "inputs": [
    { "name": "mfe", "concept": "MicroFrontend" },
    { "name": "versao", "concept": "Versao" },
    { "name": "ambiente", "concept": "Ambiente" }
  ],
  "steps": [
    { "id": "abrir", "label": "Abrir o portal que publica o MFE", "how": "navegador em {{mfe.publicadoPor.endereco}}" },
    { "id": "entrar", "label": "Entrar", "how": "{{segredo:{{mfe.publicadoPor.credencial}}}}; esperar aprovação no celular até 2 min" },
    { "id": "publicar", "label": "Criar o release", "how": "Releases › Criar release com {{versao}} e {{ambiente}}" },
    { "id": "conferir", "label": "Conferir", "how": "status verde em até 10 min" }
  ],
  "testedRun": "run_…"
}
```

Validação no aprendizado (junto com `learnProblems`, antes do cartão, sem
incomodar você):

- **Referências existem**: `mfe.publicadoPor.endereco` precisa ser uma ligação do
  conceito `MicroFrontend` e uma propriedade declarada de `Portal`. Senão, volta
  ao modelo dizendo o que falta incluir no lote.
- **Específicos no procedimento**: um id de entidade conhecida ou um valor de
  propriedade escrito literal num `how` ("checkout-mfe", "pag-hml") volta ao
  modelo com a pergunta "isto é fato ou entrada?". Verificação determinística,
  como as outras.
- **"Ficou fora do procedimento"**: o cartão lista cada valor específico da
  explicação e para onde foi (fato, entrada, cofre ou pergunta).

### 3. Passo 0: resolver as entradas

Todo procedimento com `inputs` começa resolvendo as entradas. A parte que dá para
fazer sem o modelo, o runtime faz no `playbook_start`.

```mermaid
flowchart TD
  P["pedido: sobe a 1.3 do xpto em homologação"] --> S[playbook_start]
  S --> L{"'xpto' é id ou apelido de um MicroFrontend?"}
  L -- sim --> R[resolvido, segue os passos]
  L -- não --> I["toResolve: mfe = 'xpto' + como achar (saber do conceito)"]
  I --> M[o Orbi investiga: busca no portal]
  M --> C{candidatos}
  C -- "1 claro, fora de produção" --> G[segue e conta no fim]
  C -- "1 claro, em produção" --> Q[confirma antes]
  C -- "vários ou nenhum" --> Q2[pergunta com as opções]
  G --> F["fato novo: xpto-mfe, apelido 'xpto' (origem: execução)"]
  Q --> F
  Q2 --> F
```

- **1ª vez com um MFE**: investiga, acha, executa e mostra no fim "você disse xpto;
  no portal é `xpto-mfe`. Guardei", com **Desfazer**.
- **2ª vez**: o apelido já está no cérebro e o passo 0 passa direto.
- **Ambíguo**: dois candidatos ("xyz-mfe", "xyz-mfe-legacy"), pergunta e guarda a
  resposta (e o que você disser junto, como "o legacy está desativado").

**Fatos aprendidos na execução** entram direto, marcados com a origem
(`source = execucao:<run>`), e aparecem no fim da execução com Desfazer. Conceitos
novos e mudança de procedimento continuam passando pelo cartão. Isso é uma
mudança da regra atual "nada entra sem aprovação" (ver Decisões em aberto).

### 4. Sei / não sei: a fronteira da autonomia

Antes de executar, e quando algo falha, o runtime monta a lista do que o
procedimento precisa e confere no cérebro:

- cada entrada resolvida;
- cada `{{entrada.propriedade}}` com valor (o ambiente tem `profile`?);
- cada saber usado (`Serviço ECS` sabe o que é "estar de pé"; `Fila SQS`, não).

O que falta vira **pergunta**, não suposição, e o resto segue. Quem decide se
pede aprovação continua sendo o nível (N1, N2, N3, documento 3). A lista só
decide se o Orbi **sabe**.

Na falha:

| Situação | O Orbi faz |
| --- | --- |
| Problema conhecido + conceito conhecido + procedimento de correção (ex.: cobertura do Sonar abaixo do gate) | Corrige pelo nível e avisa no fim (documento 17) |
| Erro em algo que não é conceito no cérebro (ex.: HTTP 500 do "catálogo de serviços") | Para, diz "nunca vi", pede para investigar junto; no fim, cartão **Aprendi** com o conceito, a propriedade e o problema conhecido novos |

### 5. Tela Cérebro: o mapa sem virar novelo

O grafo inteiro não escala: com centenas de fatos ele fica impossível de navegar.
A tela muda para três níveis:

- **Mapa de conceitos (padrão)**: só os tipos, as ligações entre eles e os
  procedimentos presos a cada um. São dezenas de nós, não centenas. Cada conceito
  mostra quantos fatos tem e se tem lacuna.
- **Fatos em lista**: ao escolher um conceito, os fatos dele em tabela (filtro,
  apelidos, origem e data). Ao escolher um fato, o grafo mostra só a vizinhança
  dele (1 ou 2 saltos).
- **Lacunas e fronteira**: a lista "sei agir sozinho / preciso de você" como
  painel próprio, não espalhada no grafo.

Começamos assim e medimos. Se o mapa de conceitos passar de ~60 nós, agrupar por
domínio (deploy, mudança, infraestrutura).

## Peças afetadas

| Onde | O que muda |
| --- | --- |
| `apps/runtime/src/db/migrations.ts` | Migração 19: `types.props`, `types.knows`, `entities.aliases`, `entities.source`, `playbooks.inputs`, `playbooks.intent`, `playbooks.tested_run`, `playbook_runs.kind`, `playbook_runs.resolved`; apelidos no `entities_fts` |
| `apps/runtime/src/brain/domain/types.ts` | Os campos novos |
| `apps/runtime/src/brain/domain/ontology.ts` | Referências `entrada.propriedade` válidas; lacunas de execução |
| `apps/runtime/src/brain/domain/playbooks.ts` | Entradas tipadas, preencher `{{entrada.x.y}}` pelos fatos, a lista sei / não sei |
| `apps/runtime/src/brain/domain/learning.ts` | Verificação de específicos no procedimento; separar o lote em conceitos, fatos e procedimento |
| `apps/runtime/src/agents/tools/playbooks.ts` | Passo 0 no `playbook_start` (`toResolve`); ferramenta para registrar o resolvido e o fato novo |
| `apps/runtime/src/agents/tools/brain.ts` | `brain_learn` aceita `props`, `knows`, `aliases`, `inputs`, `intent` |
| Ensaio (novo: `rehearsal_start` ou um modo do `playbook_start`) | Execução sem procedimento; tudo que publica pede |
| `apps/runtime/src/prompts/aprender-procedimento.md` | Reescrito nas fases do ensaio. Tira a referência antiga a `code_agent_prepare_fix` (hoje é `code_agent_investigate` / `code_agent_fix_known`) |
| `apps/runtime/src/review/` | Revisão do ensaio: diferenças entre explicação e prática; fatos aprendidos na execução no resumo |
| `apps/desktop/src/components/UiComponents.tsx` | Cartão de aprendizado em cinco partes; resumo "Aprendi" com Desfazer |
| `apps/desktop/src/views/brain/` | Mapa de conceitos, fatos em lista, vizinhança, painel da fronteira |
| Documentos 4, 5, 6 e 8 | Atualizados quando cada fase entrar |

## Ordem de implementação

1. **Modelo de dados e validação**: migração 19, tipos, referências
   `{{entrada.x}}`, verificação de específicos, cartão em cinco partes. Nada muda
   para quem já tem procedimentos (os campos novos são opcionais).
2. **Passo 0 e fatos de execução**: resolver entradas por id e apelido, `toResolve`
   para o modelo, fatos com origem, resumo com Desfazer.
3. **Ensaio**: execução sem procedimento, a skill reescrita, combinar início e fim,
   cartão "testado em".
4. **Sei / não sei**: a lista antes de executar e na falha; "fora da ontologia →
   delega".
5. **Tela Cérebro**: mapa de conceitos, fatos em lista, vizinhança, fronteira.

Cada fase entra com testes de fluxo no estilo de `test/flow-*.test.ts` e com o
documento da funcionalidade atualizado.

## Decisões em aberto

- **Fatos sem cartão.** Fatos observados numa execução entram direto, com origem e
  Desfazer? Ou vão para um cartão leve no fim? A proposta é direto, porque um cartão
  por apelido seria ruído. Isso abre uma exceção na regra da arquitetura
  "`aprender` sempre pede aprovação" (`CLAUDE.md`): precisa ser decidida antes da
  fase 2, e, se aceita, limitada a fatos de conceitos que já existem (nunca tipo,
  saber ou procedimento) e escrita na regra.
- **O ensaio publica de verdade?** A proposta: preenche tudo e pede confirmação
  para publicar. A alternativa é parar sempre antes e deixar o primeiro uso real
  para depois do cartão.
- **Ontologia explícita ou só uma skill de generalizar?** A skill resolve o
  procedimento poluído, mas só o grafo dá o "sei / não sei" conferível pelo
  runtime. A proposta é o grafo, mantendo o cérebro vazio no começo.
- **Duplicatas de conceito** ("Aplicacao", "Servico", "App"): quem consolida, e
  quando? Uma ideia: o "Já sei algo parecido" (documento 8) também para tipos.
- **Validade dos fatos.** Fato velho vira autonomia errada. Conferir de novo
  depois de N dias, ou quando uma execução que dependia dele falhar?

## Riscos

- **Abstração demais**: conceito para tudo deixa o cartão pesado para quem ensina.
  Regra: só vira conceito o que um procedimento referencia.
- **Ontologia inchada**: tipos quase iguais. Mitigação: o "Já sei algo parecido"
  para tipos e o mapa de conceitos que deixa isso visível.
- **Fato errado vira autonomia errada**: por isso origem, data e Desfazer em todo
  fato aprendido sozinho.
- **Nomes ambíguos** ("pagamentos" é time ou aplicação?): o passo 0 resolve pelo
  conceito da entrada e, sobrando mais de um, pergunta.

## Testes previstos

- Domínio: referências `{{entrada.x.y}}` válidas e inválidas; específicos literais
  achados; preenchimento pelos fatos; lista sei / não sei; lacunas de execução.
- Fluxo: ensinar com explicação curta → ensaio pede credencial → "não achei" →
  combinar → cartão "testado em".
- Fluxo: 1ª execução com MFE desconhecido aprende o apelido; a 2ª não investiga;
  com dois candidatos, pergunta.
- Fluxo: falha conhecida corrige sozinha; falha fora da ontologia delega e termina
  com o cartão "Aprendi".
- Migração: procedimentos antigos continuam rodando sem `inputs`.
