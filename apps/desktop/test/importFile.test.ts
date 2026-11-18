import { describe, expect, it } from 'vitest';
import { readProcedureFile } from '../src/components/ui/importFile';

const ok = { orbi: 1, exportedAt: 'agora', procedure: { name: 'publicar-no-portal' } };

describe('o arquivo que a pessoa arrastou para cima da aplicação', () => {
  it('um pacote do Orbi abre, com o nome do arquivo do lado', () => {
    expect(readProcedureFile('publicar.orbi.json', JSON.stringify(ok))).toEqual({ pack: ok, fileName: 'publicar.orbi.json' });
  });

  it('o que não é JSON é recusado dizendo o que ele não é', () => {
    const answer = readProcedureFile('foto.png', '\x89PNG\r\n');
    expect(answer).toHaveProperty('refused');
    expect((answer as { refused: string }).refused).toContain('foto.png');
  });

  it('JSON sem procedimento dentro é recusado', () => {
    expect(readProcedureFile('qualquer.json', '{"orbi":1}')).toHaveProperty('refused');
  });

  it('formato que esta versão não sabe ler é recusado dizendo isso, e não aceito pela metade', () => {
    const answer = readProcedureFile('do-futuro.orbi.json', JSON.stringify({ ...ok, orbi: 2 }));
    expect((answer as { refused: string }).refused).toContain('versão do Orbi');
  });

  it('o nome do arquivo não decide: um .orbi.json vazio é recusado, e um .txt com pacote dentro abre', () => {
    expect(readProcedureFile('mentiroso.orbi.json', '')).toHaveProperty('refused');
    expect(readProcedureFile('salvei-como-txt.txt', JSON.stringify(ok))).toHaveProperty('pack');
  });
});
