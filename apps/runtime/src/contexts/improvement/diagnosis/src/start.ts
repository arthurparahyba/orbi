import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { OrbiServices } from '../../../../services.ts';
import type { Agent } from '../../../../agents/runtime-port.ts';
import { tellAgent } from '../../../talk/index.ts';
import { log } from '../../../telemetry/index.ts';
import { agentLine } from '../../../tools/index.ts';
import { runAgent } from '../../../tools/index.ts';
import { AGENT_PROMPT, REPORT_PREFIX, reportBrief } from '../../report/src/report.ts';

type Deps = Pick<OrbiServices, 'brain' | 'diagnoses' | 'diagnosisSettings' | 'codeAgents' | 'config' | 'events'>;

/**
 * Escreve o relatório do diagnóstico de uma execução (docs/funcionalidades/24), conforme o
 * desenvolvedor escolheu em Configurações: só as regras (nada a escrever), o modelo mais barato do
 * Orbi, ou um agente de código instalado que lê o código do Orbi e confirma a causa. `asked` é o
 * "Analisar esta execução": aí o relatório sai mesmo que as regras não tenham achado nada.
 */
export async function startReport(s: Deps, agent: Agent, runId: string, asked = false): Promise<void> {
  const setup = s.diagnosisSettings.get();
  if (setup.who === 'regras' && !asked) return;
  if (setup.when === 'so-pedindo' && !asked) return;
  const run = s.brain.run(runId);
  if (!run || run.kind === 'rehearsal') return;
  const found = s.diagnoses.forRun(runId);
  if (found.length === 0 && setup.when !== 'sempre' && !asked) return;
  const brief = reportBrief(run, s.brain.calls.list(runId), found);
  if (setup.who === 'agente') {
    const written = await byCodeAgent(s, brief).catch((error) => {
      log.error('diagnóstico pelo agente não deu', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    });
    if (written) {
      s.diagnoses.saveReport(runId, written);
      return;
    }
    // Sem agente, sem código do Orbi aqui, ou o agente falhou: o modelo escreve, e o relatório diz.
  }
  await tellAgent(s.events, agent, { id: `${REPORT_PREFIX}${runId}`, message: brief });
}

/**
 * O agente de código instalado, na cópia do código do Orbi que o desenvolvedor tem nesta máquina
 * (`ORBI_SOURCE_DIR`). Só lê: roda numa pasta temporária onde só o `relatorio.md` é escrito, e o
 * código é lido de onde está. Sem o código ou sem agente da tarefa, devolve nada.
 */
async function byCodeAgent(s: Deps, brief: string): Promise<{ text: string; by: string; model: string | null } | undefined> {
  const source = s.config.sourceDir;
  const agent = s.codeAgents.forTask('diagnosticar');
  const shell = s.config.shell;
  if (!source || !existsSync(source) || !agent || !shell) return undefined;
  const dir = mkdtempSync(join(tmpdir(), 'orbi-diagnostico-'));
  try {
    writeFileSync(join(dir, 'execucao.md'), brief, 'utf8');
    const line = agentLine(agent.agent.command, `${AGENT_PROMPT('A execução está em execucao.md, nesta pasta.')}\n\nO código do Orbi está em ${source} (somente leitura).`, agent.model);
    const out = await runAgent(agent.agent, line, { cwd: dir, title: 'Orbi · diagnóstico', scratchDir: dir, shell, timeoutMs: 10 * 60_000 });
    const file = join(dir, 'relatorio.md');
    if (out.exitCode !== 0 || !existsSync(file)) return undefined;
    const text = readFileSync(file, 'utf8').trim();
    return text.length > 20 ? { text, by: agent.agent.id, model: agent.model } : undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
