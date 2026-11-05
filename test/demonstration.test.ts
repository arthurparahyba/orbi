import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault, redact, secretName } from '../src/vault.ts';
import { wavToFloat32 } from '../src/stt.ts';
import { BrainStore } from '../src/brain/store.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'vigia-test-'));

test('cofre (arquivo): guarda criptografado, resolve referências e não vaza o valor', async () => {
  const d = dir();
  const vault = new Vault(join(d, 'secrets.json'), join(d, 'secrets.enc'), join(d, 'vault.key'), 'file');
  assert.equal(await vault.backend(), 'file');
  await vault.set(secretName('portal.zup.com.br', 'Senha'), 'hunter2!', { description: 'Senha do portal' });
  assert.equal(secretName('Portal.Zup.com.br', 'Usuário'), 'portal.zup.com.br/usuario');
  assert.ok(!readFileSync(join(d, 'secrets.enc')).toString('latin1').includes('hunter2'), 'arquivo criptografado');
  assert.ok(!readFileSync(join(d, 'secrets.json'), 'utf8').includes('hunter2'), 'índice sem valores');
  assert.deepEqual(vault.list().map((s) => s.name), ['portal.zup.com.br/senha']);

  const { value, used } = await vault.resolve({ uid: '1_9', value: '{{segredo:portal.zup.com.br/senha}}', nested: ['x {{ segredo:portal.zup.com.br/senha }} y'] });
  assert.deepEqual(value, { uid: '1_9', value: 'hunter2!', nested: ['x hunter2! y'] });
  assert.equal(redact('ok: value="hunter2!"', used), 'ok: value="••••••"');
  await assert.rejects(vault.resolve({ value: '{{segredo:nao/existe}}' }), /não encontrado no cofre/);

  assert.equal(await vault.delete('portal.zup.com.br/senha'), true);
  assert.equal(await vault.get('portal.zup.com.br/senha'), undefined);
});

test('transcrição: WAV PCM16 vira float 16 kHz (com reamostragem)', () => {
  const wav = (rate: number, samples: number[]) => {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
  };
  const a = wavToFloat32(wav(16_000, [0, 0.5, -0.5]));
  assert.equal(a.samples.length, 3);
  assert.ok(Math.abs(a.samples[1] - 0.5) < 1e-3);
  const b = wavToFloat32(wav(48_000, new Array(4800).fill(0.25)));
  assert.equal(b.samples.length, 1600);
  assert.throws(() => wavToFloat32(Buffer.from('not a wav file at all, nope......................')), /WAV/);
});

test('playbook: parâmetros {{x}} preenchidos na execução, segredos continuam referência', () => {
  const brain = new BrainStore(join(dir(), 'brain.db'));
  brain.savePlaybook({
    name: 'versao-do-mfe', description: 'Atualizar versão de MFE', appliesTo: null, trigger: 'deploy de MFE', autonomy: 'ask',
    steps: [
      { id: 'entrar', label: 'Entrar', how: 'fill Senha com {{segredo:portal/senha}}' },
      { id: 'versao', label: 'Trocar {{mfe}} para {{versao}}', how: 'fill Versão com {{versao}}' },
    ],
    instructions: '', learnedFrom: null,
  } as never);
  const run = brain.startRun('versao-do-mfe', 'chat:x', { mfe: 'novo-front', versao: '2.5.0' });
  assert.equal(run.steps[1].label, 'Trocar novo-front para 2.5.0');
  assert.equal(run.steps[1].how, 'fill Versão com 2.5.0');
  assert.equal(run.steps[0].how, 'fill Senha com {{segredo:portal/senha}}');
});
