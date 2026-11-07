import { describe, expect, it } from 'vitest';
import { stepDiff } from '../src/components/stepDiff';
import { withVariations } from '../src/views/brain/Playbooks';

const s = (id: string, label: string, how = '') => ({ id, label, how });

describe('diferenças entre a base e a versão nova', () => {
  const base = [s('conferir', 'Conferir o repo'), s('criar', 'Criar', 'gh repo create'), s('proteger', 'Proteger a main'), s('avisar', 'Avisar')];
  const next = [s('conferir', 'Conferir o repo'), s('prs', 'Listar PRs abertos'), s('criar', 'Apagar', 'gh repo delete'), s('avisar', 'Avisar')];

  it('marca igual, muda, novo e sai, com o que saiu no lugar onde estava', () => {
    const d = stepDiff(base, next);
    expect(d.map((x) => [x.step.id, x.change])).toEqual([
      ['conferir', 'same'], ['prs', 'new'], ['criar', 'changed'], ['proteger', 'removed'], ['avisar', 'same'],
    ]);
    expect(d[2].before?.how).toBe('gh repo create');
  });
  it('sem base em comum, tudo é novo e tudo da base sai', () => {
    const d = stepDiff([s('a', 'A')], [s('b', 'B')]);
    expect(d.map((x) => x.change)).toEqual(['removed', 'new']);
  });
});

describe('variações no cérebro', () => {
  const pb = (name: string, variationOf: string | null = null) => ({ name, variationOf }) as never;
  it('cada variação logo depois da sua base', () => {
    const ordered = withVariations([pb('deletar', 'criar'), pb('subir'), pb('criar'), pb('orfa', 'sumiu')]);
    expect(ordered.map((p: { name: string }) => p.name)).toEqual(['subir', 'criar', 'deletar', 'orfa']);
  });
});
