import { describe, expect, it } from 'vitest';
import { choiceOf, initialKind, initialModel, chooseLabel } from '../src/views/setup/choice';
import type { ModelOption, ModelStatus } from '../src/api';

const yara: ModelOption = { kind: 'yara', label: 'yara', description: '', source: 'plugin', fields: ['model'], models: ['y1', 'y2'] };
const claude: ModelOption = { kind: 'anthropic', label: 'Claude', description: '', source: 'anthropic', fields: ['apiKey', 'model'], models: ['claude-haiku-5-5'] };
const status = (over: Partial<ModelStatus> = {}): ModelStatus => ({ ready: false, kind: 'anthropic', model: 'claude-haiku-5-5', label: '', keySet: false, options: [yara, claude], ...over });

describe('configurar o modelo', () => {
  it('sem modelo pronto, o plugin achado vem escolhido; pronto, fica o atual', () => {
    expect(initialKind(status())).toBe('yara');
    expect(initialKind(status({ ready: true }))).toBe('anthropic');
    expect(initialKind(status({ options: [{ ...yara, error: 'x' }, claude] }))).toBe('anthropic');
  });
  it('plugin manda só o modelo, nunca chave', () => {
    expect(choiceOf(yara, { model: 'y2', apiKey: 'nao', baseUrl: '' })).toEqual({ kind: 'yara', model: 'y2' });
    expect(choiceOf(claude, { model: 'claude-haiku-5-5', apiKey: ' sk ', baseUrl: '' })).toEqual({ kind: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk' });
  });
  it('modelo inicial e rótulo do botão', () => {
    expect(initialModel(status(), yara)).toBe('y1');
    expect(chooseLabel(yara)).toBe('Usar o yara');
    expect(chooseLabel(claude)).toBe('Usar o Claude');
  });
});

describe('outro runtime', async () => {
  const { otherRuntime } = await import('../src/build');
  it('avisa só quando o app instalado fala com um runtime de outro build', () => {
    expect(otherRuntime('abc-1', 'abc-2')).toBe(true);
    expect(otherRuntime('abc-1', 'abc-1')).toBe(false);
    expect(otherRuntime('abc-1', 'dev')).toBe(false);
    expect(otherRuntime(undefined, 'abc-2')).toBe(true);
  });
});
