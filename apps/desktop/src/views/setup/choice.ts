import type { ChooseModel, ModelOption, ModelStatus } from '../../api';

/** The option shown first: the one in use if it works, else the first plugin that loaded, else Claude. */
export function initialKind(status: ModelStatus): string {
  const usable = status.options.filter((o) => !o.error);
  if (status.ready && usable.some((o) => o.kind === status.kind)) return status.kind;
  return usable.find((o) => o.source === 'plugin')?.kind ?? 'anthropic';
}

export interface Draft { model: string; apiKey: string; baseUrl: string }

/** The model already picked for an option: the one in use, else the option's first. */
export function initialModel(status: ModelStatus, option: ModelOption | undefined): string {
  if (!option) return '';
  if (option.kind === status.kind && status.model) return status.model;
  return option.models[0] ?? '';
}

/** What goes to the runtime: only the fields this option asks, trimmed. */
export function choiceOf(option: ModelOption, d: Draft): ChooseModel {
  const c: ChooseModel = { kind: option.kind };
  if (option.fields.includes('model') && d.model.trim()) c.model = d.model.trim();
  if (option.fields.includes('apiKey') && d.apiKey.trim()) c.apiKey = d.apiKey.trim();
  if (option.fields.includes('baseUrl') && d.baseUrl.trim()) c.baseUrl = d.baseUrl.trim();
  return c;
}

/** "Usar o Yara" / "Usar o Claude". */
export function chooseLabel(option: ModelOption | undefined): string {
  if (!option) return 'Usar';
  if (option.source === 'anthropic') return 'Usar o Claude';
  if (option.source === 'adapter') return 'Usar este servidor';
  return `Usar o ${option.label}`;
}
