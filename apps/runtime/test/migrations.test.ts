/**
 * As migrações são aplicadas **por índice**: `user_version` é quantas já rodaram, e `migrate`
 * pula as que o número cobre. Isso faz da lista uma estrutura **só de acrescentar no fim** —
 * inserir no meio renumera todas as seguintes, e um banco que já existe tenta rodar de novo uma
 * migração que já rodou.
 *
 * Foi exatamente o que aconteceu: três migrações do documento 28 entraram no meio da lista, um
 * banco em `user_version = 29` pulou as três (o número já as cobria) e tentou criar de novo a
 * tabela `diagnosis_reports`, que tinha mudado de 29 para 32. `migrate` lança, o runtime não
 * sobe, e a aplicação fica no splash para sempre — sem dizer o que houve.
 *
 * Este teste simula **todas as versões instaladas que existem**: para cada k, um banco que parou
 * na k-ésima migração tem de chegar ao fim. Nenhuma inspeção de código pega isso; só rodar pega.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../src/db/migrations.ts';
import { migrate, schemaVersion } from '../src/db/database.ts';

/** Um banco que parou na k-ésima migração, como o de quem instalou aquela versão. */
const atVersion = (k: number): DatabaseSync => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const migration of MIGRATIONS.slice(0, k)) db.exec(migration.sql);
  db.exec(`PRAGMA user_version = ${k}`);
  return db;
};

test('todo banco de toda versão já publicada chega ao fim das migrações', () => {
  for (let k = 0; k <= MIGRATIONS.length; k++) {
    const db = atVersion(k);
    try {
      assert.equal(migrate(db), MIGRATIONS.length, `banco em user_version=${k} não chegou ao fim`);
      assert.equal(schemaVersion(db), MIGRATIONS.length);
    } catch (error) {
      assert.fail(
        `banco em user_version=${k} não sobe: ${(error as Error).message}\n` +
          'A lista de migrações só aceita acréscimo no fim: a versão do banco é o índice.',
      );
    } finally {
      db.close();
    }
  }
});

test('migrar duas vezes não faz nada na segunda', () => {
  const db = atVersion(0);
  assert.equal(migrate(db), MIGRATIONS.length);
  assert.equal(migrate(db), MIGRATIONS.length, 'a segunda passada não tem nada a fazer');
  db.close();
});
