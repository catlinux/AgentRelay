// Tests del módulo de instalación del bloque de instrucciones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyBlockToFile, END_MARK, GLOBAL_BLOCK, globalInstructionsPath,
  PROJECT_BLOCK, removeBlock, removeBlockFromFile, START_MARK, upsertBlock,
} from '../src/instructions.js';

test('bloques: GLOBAL_BLOCK y PROJECT_BLOCK tienen las marcas y el contenido', () => {
  assert.ok(GLOBAL_BLOCK.startsWith(`${START_MARK}\n`));
  assert.ok(GLOBAL_BLOCK.endsWith(`\n${END_MARK}`));
  assert.ok(GLOBAL_BLOCK.includes('## AgentRelay'));
  assert.ok(GLOBAL_BLOCK.includes('agentrelay init'));
  assert.ok(PROJECT_BLOCK.startsWith(`${START_MARK}\n`));
  assert.ok(PROJECT_BLOCK.endsWith(`\n${END_MARK}`));
  assert.ok(PROJECT_BLOCK.includes('## Delegación con AgentRelay'));
  assert.ok(PROJECT_BLOCK.includes('agentrelay run -'));
});

test('upsertBlock: created con texto vacío o solo espacios', () => {
  assert.deepEqual(upsertBlock('', PROJECT_BLOCK), { text: PROJECT_BLOCK + '\n', action: 'created' });
  assert.deepEqual(upsertBlock('   \n \n', PROJECT_BLOCK), { text: PROJECT_BLOCK + '\n', action: 'created' });
});

test('upsertBlock: added añade el bloque separado por una línea en blanco', () => {
  assert.deepEqual(upsertBlock('hola\n', PROJECT_BLOCK), { text: 'hola\n\n' + PROJECT_BLOCK + '\n', action: 'added' });
  assert.deepEqual(upsertBlock('hola', PROJECT_BLOCK), { text: 'hola\n\n' + PROJECT_BLOCK + '\n', action: 'added' });
});

test('upsertBlock: updated sustituye solo la región marcada', () => {
  const before = 'Título\n\nAntes\n';
  const after = '\nDespués\n';
  const old = `${START_MARK}\n## Viejo\n${END_MARK}`;
  const res = upsertBlock(before + old + after, PROJECT_BLOCK);
  assert.equal(res.action, 'updated');
  assert.equal(res.text, before + PROJECT_BLOCK + after);
});

test('upsertBlock: unchanged devuelve el texto sin cambios', () => {
  const text = PROJECT_BLOCK + '\n';
  assert.deepEqual(upsertBlock(text, PROJECT_BLOCK), { text, action: 'unchanged' });
});

test('upsertBlock: conserva byte a byte el contenido fuera de las marcas', () => {
  const text = `Inicio\n\n${PROJECT_BLOCK}\n\nFinal\n`;
  const res = upsertBlock(text, GLOBAL_BLOCK);
  assert.equal(res.action, 'updated');
  assert.equal(res.text, `Inicio\n\n${GLOBAL_BLOCK}\n\nFinal\n`);
});

test('upsertBlock: conserva CRLF', () => {
  const text = `Inicio\r\n\r\n${PROJECT_BLOCK}\r\n\r\nFinal\r\n`;
  const res = upsertBlock(text, GLOBAL_BLOCK);
  assert.equal(res.text, `Inicio\r\n\r\n${GLOBAL_BLOCK.replace(/\n/g, '\r\n')}\r\n\r\nFinal\r\n`);
});

test('upsertBlock: conserva el BOM inicial', () => {
  const text = '\uFEFFInicio\n';
  const res = upsertBlock(text, PROJECT_BLOCK);
  assert.equal(res.action, 'added');
  assert.equal(res.text, '\uFEFFInicio\n\n' + PROJECT_BLOCK + '\n');
});

test('upsertBlock: es idempotente', () => {
  const first = upsertBlock('hola\n', PROJECT_BLOCK);
  assert.equal(first.action, 'added');
  const second = upsertBlock(first.text, PROJECT_BLOCK);
  assert.equal(second.action, 'unchanged');
  assert.equal(second.text, first.text);
});

test('upsertBlock: lanza si falta la marca de fin', () => {
  assert.throws(() => upsertBlock(`${START_MARK}\n## algo\n`, PROJECT_BLOCK), /falta la marca de fin/i);
});

test('upsertBlock: lanza si falta la marca de inicio', () => {
  assert.throws(() => upsertBlock(`## algo\n${END_MARK}\n`, PROJECT_BLOCK), /falta la marca de inicio/i);
});

test('upsertBlock: lanza con marcas repetidas', () => {
  const text = `${START_MARK}\n${START_MARK}\n${END_MARK}\n`;
  assert.throws(() => upsertBlock(text, PROJECT_BLOCK), /repetidas/i);
});

test('upsertBlock: lanza con marcas en orden inverso', () => {
  const text = `${END_MARK}\n${START_MARK}\n`;
  assert.throws(() => upsertBlock(text, PROJECT_BLOCK), /orden inverso/i);
});

test('removeBlock: quita el bloque y la línea en blanco anterior', () => {
  const text = `Antes\n\n${PROJECT_BLOCK}\n\nDespués\n`;
  const res = removeBlock(text);
  assert.equal(res.action, 'removed');
  assert.equal(res.text, 'Antes\n\nDespués\n');
});

test('removeBlock: absent si no hay bloque', () => {
  const text = 'Sin bloque\n';
  assert.deepEqual(removeBlock(text), { text, action: 'absent' });
});

test('applyBlockToFile/removeBlockFromFile crean y borran en directorio temporal', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-instructions-'));
  try {
    const file = path.join(dir, 'nested', 'CLAUDE.md');
    assert.deepEqual(applyBlockToFile(file, PROJECT_BLOCK), { action: 'created' });
    assert.equal(readFileSync(file, 'utf8'), PROJECT_BLOCK + '\n');
    assert.deepEqual(applyBlockToFile(file, PROJECT_BLOCK), { action: 'unchanged' });
    // El archivo solo tiene el bloque: al quitarlo se elimina.
    assert.deepEqual(removeBlockFromFile(file), { action: 'removed' });
    assert.equal(existsSync(file), false);
    assert.deepEqual(removeBlockFromFile(file), { action: 'absent' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('removeBlockFromFile conserva el archivo si queda contenido', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-instructions-'));
  try {
    const file = path.join(dir, 'CLAUDE.md');
    writeFileSync(file, 'Propio\n');
    applyBlockToFile(file, PROJECT_BLOCK);
    assert.equal(readFileSync(file, 'utf8'), 'Propio\n\n' + PROJECT_BLOCK + '\n');
    assert.deepEqual(removeBlockFromFile(file), { action: 'removed' });
    assert.equal(readFileSync(file, 'utf8'), 'Propio\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('globalInstructionsPath une el directorio .claude con CLAUDE.md', () => {
  assert.equal(globalInstructionsPath('/x/.claude'), path.join('/x/.claude', 'CLAUDE.md'));
  assert.equal(globalInstructionsPath(), path.join(os.homedir(), '.claude', 'CLAUDE.md'));
});

test('upsertBlock/removeBlock: conservan byte a byte un texto con finales de línea mezclados', () => {
  const mixed = '# Mío\r\nlínea CRLF\nlínea LF\r\n\r\n';
  const added = upsertBlock(mixed, PROJECT_BLOCK);
  assert.equal(added.action, 'added');
  assert.ok(added.text.startsWith(mixed));

  const tail = '\n\nDespués del bloque\r\nfin\n';
  const edited = added.text.replace(END_MARK, `${END_MARK}${tail}`).replace('por defecto', 'EDITADO');
  const updated = upsertBlock(edited, PROJECT_BLOCK);
  assert.equal(updated.action, 'updated');
  assert.ok(updated.text.startsWith(mixed));
  assert.ok(updated.text.endsWith(`${tail}\r\n`));

  const removed = removeBlock(updated.text);
  assert.equal(removed.action, 'removed');
  assert.ok(removed.text.startsWith('# Mío\r\nlínea CRLF\nlínea LF\r\n'));
  assert.ok(removed.text.endsWith('Después del bloque\r\nfin\n\r\n'));
});
