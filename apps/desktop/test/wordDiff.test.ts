import { describe, expect, it } from 'vitest';
import { rewritten, trimSame, wordDiff } from '../src/components/stepDiff';

const show = (ps: ReturnType<typeof wordDiff>) => ps.map((p) => (p.kind === 'add' ? `[+${p.text}]` : p.kind === 'del' ? `[-${p.text}]` : p.text)).join('');

describe('correção de procedimento: só o que muda, mesclado', () => {
  it('marca o que entra e o que sai, palavra por palavra', () => {
    expect(show(wordDiff('Nunca copiar cards para um comando.', 'Nunca copiar cards ou HTML para um comando.'))).toBe('Nunca copiar cards [+ou HTML ]para um comando.');
    expect(show(wordDiff('Renomear o arquivo antes da próxima consulta.', 'Renomear o arquivo.'))).toBe('Renomear o arquivo[- antes da próxima consulta].');
    expect(show(wordDiff('em {{pasta}}/promo_bruto.json gravado', 'em {{pasta}}/promo_pagina_1.json gravado'))).toBe('em [-{{pasta}}/promo_bruto.json][+{{pasta}}/promo_pagina_1.json] gravado');
  });

  it('textos iguais não têm marca; trocar uma palavra mostra as duas', () => {
    expect(wordDiff('igual', 'igual')).toEqual([{ kind: 'same', text: 'igual' }]);
    expect(show(wordDiff('gravar em promo_bruto.json', 'gravar em promo_pagina_1.json'))).toBe('gravar em [-promo_bruto.json][+promo_pagina_1.json]');
  });

  it('trechos longos sem mudança viram "…", com algumas palavras em volta', () => {
    const long = Array.from({ length: 40 }, (_, i) => `p${i}`).join(' ');
    const ps = trimSame(wordDiff(`${long} fim`, `${long} final`), 3);
    expect(show(ps)).toBe('…p37 p38 p39 [-fim][+final]');
  });

  it('mede quanto foi reescrito', () => {
    expect(rewritten(wordDiff('a b c d', 'a b c d e'))).toBeLessThan(0.3);
    expect(rewritten(wordDiff('curto', 'um texto totalmente diferente e bem maior'))).toBeGreaterThan(0.8);
  });
});

describe('como mostrar a mudança', () => {
  it('poucas palavras em poucos lugares: na linha; reescrita: antes em cima, depois embaixo', async () => {
    const { diffLayout, changeIslands, wordDiff: diff } = await import('../src/components/stepDiff');
    const small = diff('Abrir o portal de clientes e entrar com o usuário de serviço', 'Abrir o portal de pagamentos e entrar com o usuário de serviço');
    expect(changeIslands(small)).toBe(1);
    expect(diffLayout(small)).toBe('inline');
    const rewrite = diff(
      'Obter o HTML da página de resultados filtrada (URL de filtro de promoção) com run_command curl, gravando em busca_pagina_1.html.',
      'curl não é permitido nesta máquina: não usar. Criar a pasta com run_command mkdir -p e rodar browser_act evaluate_script com saveTo.',
    );
    expect(diffLayout(rewrite)).toBe('stacked');
    const scattered = diff('a b c d e f g h i j k l m n o p', 'a X c d Y f g Z i j W l m n o p');
    expect(changeIslands(scattered)).toBe(4);
    expect(diffLayout(scattered)).toBe('stacked');
  });
});
