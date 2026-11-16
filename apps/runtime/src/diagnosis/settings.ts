import type { DatabaseSync } from 'node:sqlite';

/**
 * Quem escreve o relatório do diagnóstico e quando (docs/funcionalidades/24). As regras (os
 * detectores) rodam sempre e não custam nada; o relatório é o que explica os achados juntos.
 *
 *  - `regras`: só o que os detectores acharam, sem modelo nenhum.
 *  - `modelo`: o modelo mais barato do Orbi escreve o relatório; não lê o código.
 *  - `agente`: um agente de código instalado lê o código do Orbi e confirma a causa, com arquivo
 *    e linha; usa a assinatura do desenvolvedor, e precisa do código nesta máquina.
 */
export type DiagnosisWho = 'regras' | 'modelo' | 'agente';
/** `quando-houver`: só quando as regras acham algo. `so-pedindo`: só com "Analisar esta execução". */
export type DiagnosisWhen = 'quando-houver' | 'so-pedindo' | 'sempre';

export interface DiagnosisSetup {
  who: DiagnosisWho;
  when: DiagnosisWhen;
}

/** O padrão é o que não gasta: as regras, que já rodam de graça no fim de cada execução. */
export const DEFAULT_SETUP: DiagnosisSetup = { who: 'regras', when: 'quando-houver' };
const KEY = 'diagnosis-setup';

export class DiagnosisSettings {
  constructor(private readonly db: DatabaseSync) {}

  get(): DiagnosisSetup {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
    try {
      return row ? { ...DEFAULT_SETUP, ...(JSON.parse(row.value) as Partial<DiagnosisSetup>) } : DEFAULT_SETUP;
    } catch {
      return DEFAULT_SETUP;
    }
  }

  set(next: Partial<DiagnosisSetup>): DiagnosisSetup {
    const setup = { ...this.get(), ...next };
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(setup));
    return setup;
  }
}
