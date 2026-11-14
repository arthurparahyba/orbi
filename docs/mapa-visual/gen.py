import json, html
E=html.escape
CSS="""
body{margin:0;background:#0e1014}
a{color:#6ca8ff}a:hover{color:#9cc4ff}
.pg{font-family:'IBM Plex Sans',sans-serif;background:#0e1014;color:#e6e8ee;font-size:14px;line-height:1.5;padding:28px 32px;box-sizing:border-box;min-height:900px}
h1{margin:0 0 4px;font-size:24px;font-weight:600}
.sub{color:#9aa3b5;margin:0 0 20px;font-size:14.5px;max-width:980px}
.k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3b5;font-weight:600;margin:0 0 8px}
.mono,.t{font-family:'IBM Plex Mono',monospace;font-size:12px}
.t{display:inline-block;border:1px solid #2c3a52;background:#141b26;color:#9cc4ff;border-radius:6px;padding:1px 7px;margin:2px 4px 2px 0}
.t.g{border-color:#6a5224;background:#1d1809;color:#f2c46b}
.t.s{border-color:#5a4a8a;background:#17142a;color:#cfc3f5}
.dim{color:#9aa3b5}
.row{display:grid;grid-template-columns:34px 96px minmax(0,1.25fr) minmax(0,1fr) 190px;gap:14px;padding:12px 0;border-top:1px solid #1d2029;align-items:start}
.row.head{border-top:0;padding:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3b5;font-weight:600}
.n{width:26px;height:26px;border-radius:50%;border:1px solid #2b303d;display:grid;place-items:center;font-size:12px;color:#9aa3b5}
.who{font-size:11.5px;border-radius:999px;padding:2px 10px;border:1px solid;justify-self:start;white-space:nowrap}
.w-voce{color:#9cc4ff;border-color:#2c3a52;background:#141b26}
.w-orbi{color:#f2c46b;border-color:#6a5224;background:#1d1809}
.w-run{color:#8fe3b8;border-color:#2c5a46;background:#14211b}
.w-rev{color:#cfc3f5;border-color:#5a4a8a;background:#17142a}
.what b{font-weight:600}
.db{font-size:12px;color:#9aa3b5}
.db code{font-family:'IBM Plex Mono',monospace;color:#c9cedb;font-size:11.5px}
.ui{border:1px solid #2b303d;border-radius:10px;background:#12151b;padding:9px 11px;font-size:12.5px}
.ui .uk{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#b9a6f0;font-weight:600;display:block;margin-bottom:3px}
.ui .btns{display:flex;gap:6px;margin-top:7px}
.ui .b{font-size:11.5px;border:1px solid #2b303d;border-radius:6px;padding:2px 9px;background:#1a1e27}
.ui .b.p{background:#f2b13c;color:#1a1408;border-color:#f2b13c;font-weight:600}
.stp{display:flex;gap:6px;align-items:center;font-size:12px;margin:2px 0}
.dot{width:12px;height:12px;border-radius:50%;border:1px solid #3a4050}
.dot.d{background:#2c5a46;border-color:#2c5a46}.dot.r{border-color:#f2b13c;background:#2a2210}
.msg{align-self:flex-end;background:#1d2533;border:1px solid #2c3a52;border-radius:10px 10px 2px 10px;padding:6px 10px;font-size:12.5px;display:inline-block}
.bad{border:1px solid #6a2c2c;background:#211414;color:#ffc9c9;border-radius:8px;padding:6px 9px;font-size:12.3px;margin-top:6px}
.ok{border:1px solid #2c5a46;background:#14211b;color:#c9f3dc;border-radius:8px;padding:6px 9px;font-size:12.3px;margin-top:6px}
.open{border:1px solid #6a5224;background:#1d1809;color:#f2c46b;border-radius:8px;padding:6px 9px;font-size:12.3px;margin-top:6px}
.cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.box{background:#14171e;border:1px solid #222631;border-radius:12px;padding:14px 16px}
.box h3{margin:0 0 8px;font-size:14.5px;font-weight:600}
.box ul{margin:0;padding-left:16px;font-size:13px}
.box li{margin:3px 0}
.flow{display:grid;grid-template-columns:minmax(0,1fr) 40px minmax(0,1.3fr) 40px minmax(0,1fr);gap:0;align-items:stretch;margin-bottom:18px}
.arr{display:grid;place-items:center;color:#7d8597;font-size:20px}
.legend{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px;font-size:12.5px;align-items:center}
"""
WHO={'voce':'Você','orbi':'Orbi (modelo)','run':'Runtime','rev':'Revisor'}
def tools(ts): return ''.join(f'<span class="t {c}">{E(n)}</span>' for n,c in ts)
def row(n,who,what,ts,ui,db,mark=''):
    return f'''<div class="row"><span class="n">{n}</span><span class="who w-{who}">{WHO[who]}</span><div class="what">{what}<div>{tools(ts)}</div>{mark}</div><div>{ui}</div><div class="db">{db}</div></div>'''
HEAD='<div class="row head"><span>#</span><span>Quem</span><span>O que acontece e o que é chamado</span><span>O que você vê</span><span>Onde fica guardado</span></div>'
LEG='<div class="legend"><span class="dim">Chamadas:</span><span class="t">ferramenta comum</span><span class="t g">passa pelo portão (pode pedir aprovação)</span><span class="t s">sinal do runtime para a conversa</span></div>'
def ui(kick,body,btns=()):
    b=''.join(f'<span class="b {"p" if i==0 else ""}">{E(x)}</span>' for i,x in enumerate(btns))
    return f'<div class="ui"><span class="uk">{E(kick)}</span>{body}{f"<div class=btns>{b}</div>" if b else ""}</div>'
def steps(*ss): return ''.join(f'<div class="stp"><span class="dot {c}"></span>{E(l)}</div>' for l,c in ss)
def page(title,sub,body,h):
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>{E(title)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&amp;family=IBM+Plex+Sans:wght@400;500;600&amp;display=swap">
<style>{CSS}</style>
</helmet>
<div class="pg" style="width: 100%">
<h1>{E(title)}</h1><p class="sub">{sub}</p>
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1440,"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
T=lambda n:(n,''); G=lambda n:(n,'g'); S=lambda n:(n,'s')
boards={}

# ── 1 ──
b1=f'''
<div class="flow">
<div class="box"><h3>O que chega</h3><ul><li><b>Uma mensagem sua</b> (texto ou ditado)</li><li><b>Um sinal do runtime</b>: {tools([S('tool-approval'),S('tool-approval-result'),S('review'),S('knowledge'),S('card'),S('followup'),S('pipeline'),S('secret-saved'),S('agent-request')])}</li><li>O histórico da conversa</li></ul><p class="dim" style="font-size:12.5px;margin:8px 0 0">Cada chegada abre um <b>turno</b>.</p></div>
<div class="arr">→</div>
<div class="box" style="border-color:#6a5224"><h3>O Orbi é montado de novo a cada turno</h3><ul>
<li><b>Modelo</b> do tipo de trabalho: conversa, executar, aprender (<span class="mono">llm/roles.ts</span>)</li>
<li><b>Instruções</b>: a base + as partes da situação (abaixo)</li>
<li><b>Situação</b>, em linhas vindas do banco (abaixo)</li>
<li><b>Skills</b> e <b>ferramentas</b> (abaixo)</li></ul>
<p class="dim" style="font-size:12.5px;margin:8px 0 0"><span class="mono">agents/orbi.ts</span> · <span class="mono">agents/prompt.ts</span> · <span class="mono">agents/capabilities.ts</span></p></div>
<div class="arr">→</div>
<div class="box"><h3>O que sai</h3><ul><li>Texto na conversa</li><li><b>Chamadas de ferramenta</b></li><li>Componentes na tela, pelo {tools([T('show_ui')])} ou pelas próprias ferramentas</li></ul><p class="dim" style="font-size:12.5px;margin:8px 0 0">O modelo nunca escreve HTML: escolhe um componente do catálogo.</p></div>
</div>
<div class="cols">
<div class="box"><h3>Instruções</h3><p class="k">sempre</p><ul><li><span class="mono">base.md</span>: quem é, como terminar um turno, "já sei algo parecido?"</li></ul><p class="k" style="margin-top:10px">conforme a situação</p><ul>
<li><span class="mono">procedimento.md</span> + <span class="mono">falhas.md</span>: há procedimento em execução</li>
<li><span class="mono">falhas.md</span>: a última ferramenta falhou</li>
<li><span class="mono">esteiras.md</span>: existe esteira</li>
<li><span class="mono">cartao.md</span>: a mensagem veio de dentro de um cartão</li>
<li><span class="mono">agentes.md</span>: pedido de um agente de código</li>
<li><span class="mono">agentes-de-codigo.md</span>: há agente instalado e algo falhou</li>
<li><span class="mono">passo-zero.md</span>: vem no <span class="mono">playbook_start</span>, quando há entrada a resolver</li></ul></div>
<div class="box"><h3>Situação (linhas do banco)</h3><ul>
<li>Cérebro agora: N tipos, entidades, ligações, procedimentos, aprendizados aguardando</li>
<li>Procedimento em execução (ou nenhum)</li>
<li>Retorno agendado desta conversa</li>
<li>Esteiras e em que etapa esta entrega está</li>
<li>Credenciais no cofre: <b>só os nomes</b></li>
<li>Pasta de trabalho e id da conversa</li></ul>
<h3 style="margin-top:14px">Skills</h3><ul>
<li><span class="mono">aprender-procedimento</span>: entender, ensaiar, combinar, cartão</li>
<li><span class="mono">corrigir-procedimento</span>: depois da revisão</li>
<li>Os procedimentos <b>mais usados</b>, uma linha cada; os outros são achados por {tools([T('playbook_similar')])}</li></ul></div>
<div class="box"><h3>Ferramentas: mãos</h3>
<p class="k">terminal</p>{tools([G('run_command'),G('run_shell'),G('run_script'),T('run_python')])}
<p class="k" style="margin-top:8px">navegador</p>{tools([T('mcp__chrome__* (ler)'),G('browser_act')])}
<p class="k" style="margin-top:8px">servidores MCP seus</p>{tools([G('mcp__<servidor>__<ferramenta>')])}
<p class="k" style="margin-top:8px">agentes de código</p>{tools([G('code_agent_investigate'),G('code_agent_fix_known'),G('code_agent_push_fix'),T('code_agent_test')])}
<p class="k" style="margin-top:8px">subagente</p>{tools([T('investigador (só leitura)')])}
<h3 style="margin-top:14px">O portão</h3><p style="font-size:13px;margin:0">Toda ferramenta amarela passa pelo portão (<span class="mono">agents/gate.ts</span>): pela categoria, pelo nível do procedimento (N1 a N3) e por a ação já ser conhecida, ela <b>roda sozinha</b> ou vira <b>cartão de aprovação</b>. Aprender sempre pede.</p></div>
<div class="box"><h3>Ferramentas: memória</h3>
{tools([T('brain_query'),G('brain_learn'),T('playbook_similar'),T('similar_found')])}
<p class="k" style="margin-top:8px">executar</p>{tools([T('playbook_start'),T('playbook_step'),T('playbook_resolve')])}
<p class="k" style="margin-top:8px">ensaiar</p>{tools([T('rehearsal_start'),T('rehearsal_step'),T('rehearsal_finish')])}
<h3 style="margin-top:14px">Ferramentas: voz</h3>
{tools([T('show_ui'),T('ask_developer'),T('ask_secret'),T('schedule_followup'),T('cancel_followup'),T('pipeline_start'),T('pipeline_provide')])}
<h3 style="margin-top:14px">Outros agentes</h3><ul><li><b>Revisor de conhecimento</b>: roda no fim da execução, só propõe fatos</li><li><b>Configurador</b>: o chat das Configurações</li></ul></div>
</div>'''
boards['Main']=('A · O que o Orbi recebe e tem em cada turno','Quando você abre o chat e manda uma mensagem, isto é o que o modelo tem na mão. Nada do seu domínio está no código: procedimentos, conceitos e fatos vêm do Cérebro.',LEG+b1,1180)

# ── 2 ensinar ──
r=[HEAD,
row(1,'voce','Você explica o que quer que ele aprenda.',[],'<span class="msg">Aprende a consultar promoções de informática na Amazon e gerar um HTML</span>','<code>conversations</code>'),
row(2,'orbi','<b>Entender.</b> Vê se já sabe algo parecido e o que o Cérebro tem.',[T('playbook_similar'),T('similar_found'),T('brain_query')],ui('Já sei algo parecido','consultar-promocoes · 3 de 5 passos iguais',('Era isso mesmo','Criar versão','É outra coisa')),'lê <code>playbooks</code>, <code>entities</code>'),
row(3,'orbi','<b>Ensaiar.</b> Abre o ensaio e faz cada parte com as ferramentas de sempre, relatando o que achou.',[T('rehearsal_start'),T('rehearsal_step'),T('mcp__chrome__navigate_page'),G('browser_act'),G('run_command')],ui('Ensaio: promoções',steps(('Abrir o site','d'),('Filtrar promoções','r'),('Extrair produtos',''))),'<code>playbook_runs</code> com <code>kind = rehearsal</code>'),
row(4,'run','O que muda algo passa pelo <b>portão</b>. No ensaio, o que publica sempre pede.',[S('tool-approval'),S('tool-approval-result')],ui('Aprovação · local','Gravar a lista em promo.json',('Aprovar','Negar')),'<code>inbox_items</code>; a ação no histórico do ensaio'),
row(5,'orbi','Falta uma senha? Pede pelo cartão; o valor vai direto para o cofre.',[T('ask_secret')],ui('Credencial','portal/senha · você digita no cartão',('Salvar',)),'cofre do sistema; o modelo só vê <code>&#123;&#123;segredo:nome&#125;&#125;</code>'),
row(6,'orbi','<b>Combinar.</b> Fecha o ensaio com o acordo: quando começa, o que recebe, quando termina, o que fica de fora, o que a explicação tinha de errado.',[T('rehearsal_finish')],ui('Combinando início e fim','Começa: pedirem promoções · Termina: HTML gerado',('Está certo','Ajustar')),'<code>playbook_runs.outputs.acordo</code>'),
row(7,'orbi','<b>O cartão.</b> Um só, com o procedimento, os conceitos e os fatos, e o ensaio que o provou.',[G('brain_learn')],ui('Aprendizado para o cérebro','consultar-promocoes · 5 passos · ensaiado hoje',('Aprovar','Negar')),'<code>proposals</code>, <code>inbox_items</code>','<div class="ok">O cartão avisa que o procedimento fica em <b>rascunho</b> até rodar como está escrito.</div>'),
row(8,'run','Antes do cartão, o runtime confere o lote: tipos, credencial em texto, programa não permitido, o mesmo fato com outro nome, o ensaio terminado.',[],'<span class="dim">problema volta ao modelo; nada é pedido a você</span>','—'),
row(9,'voce','Você aprova. Tudo entra de uma vez, ou nada.',[S('tool-approval')],ui('Guardado','consultar-promocoes · N1 · Aprendiz · rascunho'),'<code>playbooks</code>, <code>types</code>, <code>entities</code>, <code>edges</code>'),
row(10,'run','O <span class="mono">brain_learn</span> responde na hora: <b>está em rascunho, rode para provar</b>. Os passos que o cartão guardou nunca rodaram como estão escritos.',[],'<span class="dim">nada na tela</span>','—'),
row(11,'orbi','<b>Provar.</b> Roda o procedimento do começo à entrega. Falha não encerra: acha outro jeito e segue. Cada passo fechado sem falha pendente fica <b>provado</b>; no fim, propõe o passo corrigido com o que aprendeu.',[T('playbook_start'),T('playbook_step'),G('brain_learn')],ui('consultar-promocoes','provado · 5 de 5 passos'),'<code>playbook_proofs</code> · <code>playbook_learnings</code>','<div class="ok">Documento 25. Passo que muda de texto perde a prova sozinho.</div>'),
]
boards['ensinar']=('B · Ensinar um procedimento','A skill aprender-procedimento manda o Orbi ensaiar antes de guardar: entender, ensaiar, combinar e só então o cartão.',LEG+''.join(r),1240)

# ── 3 executar ──
r=[HEAD,
row(1,'voce','Você pede.',[],'<span class="msg">consulta as promoções de informática</span>','<code>conversations</code>'),
row(2,'orbi','Acha o procedimento (skill do catálogo ou busca) e começa.',[T('playbook_similar'),T('playbook_start')],ui('consultar-promocoes',steps(('Abrir o site','r'),('Ir à categoria',''),('Filtrar',''),('Extrair',''),('Gerar HTML',''))),'<code>playbook_runs</code>'),
row(3,'run','<span class="mono">playbook_start</span> devolve ao modelo: os passos, o nível, as regras de execução, as entregas esperadas e <b>o que já foi tentado</b> (<span class="mono">jaTentado</span>). Se uma entrada não é um fato conhecido, vem o passo 0.',[T('playbook_resolve')],ui('Passo 0','"xpto" é o MicroFrontend xpto-mfe · Desfazer'),'<code>playbook_learnings</code> (lido) · fato novo em <code>entities</code>'),
row(4,'orbi','Para cada passo: chama as ferramentas do passo e só depois marca feito. Fechar um passo abre o próximo.',[T('mcp__chrome__navigate_page'),T('playbook_step')],ui('consultar-promocoes',steps(('Abrir o site','d'),('Ir à categoria','r'),('Filtrar',''))),'<code>playbook_runs.steps</code>'),
row(5,'run','<b>O portão</b> decide cada ação que muda algo: categoria + nível do procedimento + ação já conhecida.',[G('browser_act'),G('run_command'),G('run_script')],ui('Aprovação · passo 4 de 5 · Extrair','navegador: evaluate_script → promo.json',('Aprovar','Negar')),'<code>inbox_items</code>; aprovada, vira <b>ação conhecida</b> em <code>playbook_known_actions</code>'),
row(6,'run','Cada chamada vira uma linha do <b>registro da execução</b>: passo, aprovação, duração, quanto voltou ao modelo e marcas (leitura cara, resposta cortada, chamada errada). O que falhou vira <b>desvio</b> da execução.',[],ui('Execuções · Ver detalhes','4 · Extrair: evaluate_script [leitura cara]',('Copiar execução completa','Só problemas')),'<code>run_calls</code> · <code>playbook_runs.deviations</code>','<div class="ok">Documento 24, fase 1: o registro e a tela de detalhes.</div><div class="open">Falta: detectores e diagnóstico.</div>'),
row(7,'orbi','Algo falhou: segue <span class="mono">falhas.md</span>. Problema conhecido do Cérebro vem com a solução; desconhecido, pergunta se investiga.',[T('brain_query'),T('ask_developer'),G('code_agent_investigate')],ui('Pergunta','O login pede aprovação no celular. Espero?',('Esperar 5 min','Parar')),'<code>inbox_items</code>'),
row(8,'orbi','Espera longa (CI, deploy): agenda um retorno em vez de ficar consultando.',[T('schedule_followup'),S('followup')],ui('Retorno agendado','ver o deploy em 10 min'),'<code>followups</code>'),
row(9,'orbi','Último passo: registra o que o procedimento entrega.',[T('playbook_step')],ui('consultar-promocoes · concluído','html_path = saida/promocoes.html · total = 48'),'<code>playbook_runs.outputs</code>'),
]
boards['executar']=('C · Executar um procedimento','Do pedido até a entrega. O checklist, os cartões de aprovação e as perguntas saem das próprias ferramentas.',LEG+''.join(r),1260)

# ── 4 depois ──
r=[HEAD,
row(1,'run','<b>Revisão no fim do turno</b>, sem modelo: analisadores olham a execução (passo dado como feito com falha, desvios, python solto, aprovações que dariam para cortar).',[],'<span class="dim">nada ainda</span>','<code>review/analyzers/</code>'),
row(2,'run','<b>Nível.</b> Execução limpa conta para subir (N1 → N2 → N3); negada ou falha desce. Sempre avisa, com Manter.',[],ui('Nível','consultar-promocoes subiu para N2 · Assistido',('Ok','Manter N1')),'<code>playbook_levels</code>, <code>autonomy_events</code>'),
row(3,'run','<b>Juiz</b> (regras puras): o que vira pedido de mudança, o que é problema novo a aprender, o que é ambiente a corrigir, o que é só ideia guardada.',[],ui('Revisão da execução','1 problema no passo extrair · 1 ideia guardada'),'<code>review_notes</code>: ideia, ambiente, escopo da mudança'),
row(4,'run','O que a execução tentou e falhou num passo que terminou feito vira <b>aprendizado do procedimento</b>.',[],'<span class="dim">seção Aprendizados no Cérebro</span>','<code>playbook_learnings</code>'),
row(5,'run','Manda o sinal para a conversa: o que mudar, <b>só em quais passos</b>, o que esta máquina tem, <b>o que já foi tentado</b> naquele procedimento e a <b>retrospectiva</b> desta execução (o que falhou em cada passo e o que funcionou depois, lido do registro).',[S('review')],'<span class="dim">o cartão da revisão já está na conversa</span>','—'),
row(6,'orbi','Com a skill <span class="mono">corrigir-procedimento</span>, propõe a correção em um cartão só. Conta em <span class="mono">learnings</span> o que tentou e o que funcionou, e oferece rodar de novo: passo mudado volta a ser passo <b>não provado</b>.',[G('brain_learn')],ui('Corrigir o procedimento','Passo 4: antes (vermelho) / depois (verde) · Por quê: …',('Aprovar','Negar')),'aprovado: <code>playbooks</code> + <code>playbook_learnings</code>; a prova do passo cai'),
row(7,'run','Travas do cartão de revisão: mexer fora dos passos pedidos, ou mudar a ordem, volta ao modelo. O histórico só informa: <b>nada é recusado por já ter sido tentado</b>.',[],'<span class="dim">você só vê o cartão que passou</span>','—'),
row(8,'rev','<b>Revisor de conhecimento</b> (outro agente, modelo mais barato): lê o que a execução leu, já sem credenciais, e propõe fatos. O runtime tira o que o Cérebro já sabe.',[T('propose_facts'),S('knowledge')],ui('Aprendizado para o cérebro','pagamentos-api · acrescenta banco = pag-db · passo "repo" passa a consultar o Cérebro',('Aprovar','Negar')),'<code>entities</code>, <code>edges</code> (soma, não troca)'),
row(9,'voce','<b>Conversa dentro do cartão.</b> Você pergunta ou pede um ajuste no próprio cartão; a proposta muda no lugar.',[S('card'),G('brain_learn')],ui('Mudou na conversa','Passo 5: grava com a data no nome',('Aprovar','Negar')),'<code>inbox_items.version</code> e <code>.versions</code>'),
row(10,'voce','<b>Mudança a seu pedido</b>, no meio da execução ou depois: não depende de revisão nem do escopo dela.',[G('brain_learn')],ui('Mudança que você pediu','Você pediu: "muda o passo 5 pra gravar com a data"',('Aprovar','Negar')),'<code>playbooks</code>'),
]
boards['depois']=('D · Depois da execução: revisar, aprender, corrigir','Quem decide o nível e o que merece mudança é o runtime, com regras. O modelo só propõe o que foi pedido, e você aprova.',LEG+''.join(r),1380)

# ── 5 livros ──
r=[HEAD,
row(1,'orbi','Pedido de livros infantis: achou o procedimento de informática e você escolheu "Criar versão".',[T('playbook_similar'),T('similar_found')],ui('Já sei algo parecido','consultar-promocoes-informatica',('Criar versão',)),'—','<div class="open">Terceira versão quase igual. Aberto: a categoria virar entrada em vez de versão (doc 23, item 7).</div>'),
row(2,'orbi','Propôs a versão citando o script da base.',[G('brain_learn')],'<span class="dim">recusado antes do cartão; pediu um find, você mandou gerar outro script</span>','—','<div class="bad">A versão não herdava scripts nem entregas, e o Orbi não conseguia ler o script da base.</div><div class="ok">Corrigido: versão herda da base; brain_query devolve o procedimento.</div>'),
row(3,'orbi','Leu a página inteira duas vezes para achar a categoria.',[T('mcp__chrome__take_snapshot')],ui('Detalhes da execução','2 leituras caras · 186 mil caracteres'),'<code>run_calls</code> com marca <code>caro</code>','<div class="bad">Cerca de 45 mil e 141 mil caracteres ao modelo.</div><div class="ok">Corrigido em parte: a chamada cara fica marcada e, somando muito, vira ideia no procedimento.</div><div class="open">Falta a linha no fim da conversa.</div>'),
row(4,'orbi','Pediu o mkdir com o passo 3 ainda aberto e nunca abriu o passo 5.',[G('run_command'),T('playbook_step')],ui('Aprovação · passo 3 de 5 · Filtrar','mkdir saida/livros',('Aprovar',)),'ação contada no passo errado','<div class="bad">O cartão mostrava o passo errado.</div><div class="ok">Corrigido: fechar um passo abre o próximo; fora de ordem é recusado.</div>'),
row(5,'run','Extração com saveTo: o runtime cortou a resposta em 30 mil caracteres antes de gravar.',[G('browser_act')],ui('Aprovação · Extrair','evaluate_script → promo_pagina_1.json',('Aprovar',)),'arquivo com cabeçalho e meio JSON','<div class="bad">A origem de quase tudo: defeito do Orbi, não do procedimento.</div><div class="ok">Corrigido: o arquivo recebe a resposta inteira; .json inválido não é gravado.</div>'),
row(6,'orbi','Investigou o arquivo com head e tail; o script do HTML falhou no JSON.',[G('run_command'),G('run_shell'),G('run_script')],'<span class="dim">3 aprovações só para olhar</span>','desvio <code>comando</code>','<div class="bad">Comando de leitura pedia aprovação; head nem estava na lista e seria recusado depois.</div><div class="ok">Corrigido: leitura não pede; fora da lista é recusado antes do cartão.</div>'),
row(7,'orbi','Contornou: 3 extrações em lotes de 20 e um python para juntar.',[G('browser_act'),G('run_command')],'<span class="dim">4 aprovações a mais</span>','—','<div class="bad">12 aprovações no total.</div>'),
row(8,'run','Revisão: acusou show_ui e evaluate_script (chamadas erradas do modelo) e abriu o passo extrair para mudança.',[S('review')],ui('Revisão da execução','passo extrair foi dado como feito, mas show_ui e evaluate_script falhou'),'<code>review_notes</code>','<div class="bad">Culpou a falha errada e não viu o arquivo cortado.</div><div class="ok">Corrigido em parte: chamada errada não acusa o passo.</div><div class="open">Falta: diagnóstico "do Orbi" separado (doc 24).</div>'),
row(9,'orbi','Propôs guardar o contorno no procedimento, com os passos fora de ordem.',[G('brain_learn')],ui('Corrigir o procedimento','extrair em lotes de 20 + juntar_lotes.py',('Aprovar','Negar')),'—','<div class="bad">O remendo viraria regra; a trava não conferia a ordem; a correção apagaria as entregas.</div><div class="ok">Corrigido: ordem travada, entregas preservadas. Negado, fica nos aprendizados.</div>'),
]
boards['livros']=('E · Onde deu errado: execução de livros infantis (13/11)','A mesma linha de execução, com o que falhou em cada ponto. Vermelho: o defeito. Verde: já corrigido. Amarelo: ainda aberto.',LEG+''.join(r),1500)

names=list(boards)
canvas={"v":3,"createdOnFiles":{"v":1,"at":"2026-11-13T22:45:00Z"},"title":"Orbi · Como funciona hoje (mapa visual)","launch":{"view":"canvas"},"pages":[],"boards":{},"order":[],"notes":{},"designSystems":[]}
x=0
for n in names:
    t,s,b,h=boards[n]
    open(f'project/{n}.dc.html','w').write(page(t,s,b,h))
    canvas["boards"][f"{n}.dc.html"]={"x":x,"y":0,"w":1440,"h":h,"title":t,"expand":"fill"}
    canvas["order"].append(f"{n}.dc.html"); x+=1520
json.dump(canvas,open('project/canvas.json','w'),ensure_ascii=False,indent=1)
print(names)
