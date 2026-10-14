import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FIXTURE, TAREAS, escribirFixture } from '../src/evaluar-tareas.js';

const SLUGIFY_REF = `export function slugify(s) {
  let out = '';
  for (const ch of String(s).toLowerCase().normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(s, n, suffix = '…') {
  if (n <= 0) return '';
  if (suffix.length > n) return suffix.slice(0, n);
  if (s.length <= n) return s;
  return s.slice(0, n - suffix.length) + suffix;
}
`;

const STATS_REF_RENOMBRADO = `export function average(values, { round } = {}) {
  if (!values || values.length === 0) return 0;
  let result = values.reduce((a, b) => a + b, 0) / values.length;
  if (Number.isInteger(round) && round >= 0) {
    result = Number(result.toFixed(round));
  }
  return result;
}

export function median(values) {
  const sorted = values.sort((a, b) => a - b);
  return sorted[Math.floor(values.length / 2)];
}
`;

const STATS_REF_REGRESION = `export function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
`;

const REPORT_REF = `import { average } from './stats.js';

export function summary(values) {
  return { count: values.length, mean: average(values) };
}
`;

const TEXT_TEST_REF = FIXTURE['test/text.test.js'];

const STATS_TEST_REF_RENOMBRADO = `import test from 'node:test';
import assert from 'node:assert/strict';
import { average, median } from '../src/stats.js';

test('average', () => {
  assert.equal(average([1, 2, 3]), 2);
});

test('median odd', () => {
  assert.equal(median([1, 2, 3]), 2);
});
`;

const STATS_TEST_REF_REGRESION = `import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median } from '../src/stats.js';

test('mean', () => {
  assert.equal(mean([1, 2, 3]), 2);
});

test('median odd', () => {
  assert.equal(median([1, 2, 3]), 2);
});

test('median even', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});
`;

const REPORT_TEST_REF = FIXTURE['test/report.test.js'];

const README_REF = `# AgentRelay fixture

## Uso
- slugify: convierte texto en slug
- truncate: recorta texto con sufijo
- median: mediana de valores
`;

const REFERENCES = {
  contrato: {
    'src/text.js': SLUGIFY_REF,
  },
  renombrado: {
    'src/stats.js': STATS_REF_RENOMBRADO,
    'src/report.js': REPORT_REF,
    'test/stats.test.js': STATS_TEST_REF_RENOMBRADO,
  },
  regresion: {
    'src/stats.js': STATS_REF_REGRESION,
    'test/stats.test.js': STATS_TEST_REF_REGRESION,
  },
  parar: {
    'README.md': README_REF,
  },
};

function runTests(dir) {
  const env = {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  const r = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', env });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function makeTempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'evaluar-tareas-test-'));
}

for (const tarea of TAREAS) {
  test(`fixture base visible pass: ${tarea.id}`, () => {
    const dir = makeTempDir();
    try {
      escribirFixture(dir);
      const r = runTests(dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`hidden suspend on base: ${tarea.id}`, () => {
    const dir = makeTempDir();
    try {
      escribirFixture(dir, tarea.hidden);
      const r = runTests(dir);
      assert.notEqual(r.status, 0, 'ocultas deberian suspender en el fixture base');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`reference passes hidden: ${tarea.id}`, () => {
    const dir = makeTempDir();
    try {
      escribirFixture(dir, tarea.hidden);
      const ref = REFERENCES[tarea.id] || {};
      for (const [rel, content] of Object.entries(ref)) {
        const full = path.join(dir, rel);
        writeFileSync(full, content);
      }
      const r = runTests(dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('task text does not reveal hidden cases', () => {
  const forbidden = ['abc…', '1.67', '2.5', 'mutar', 'muta ', 'No modificar LEGACY'];
  for (const tarea of TAREAS) {
    const collect = (value) => {
      const out = [];
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach((v) => out.push(...collect(v)));
      else if (value && typeof value === 'object') Object.values(value).forEach((v) => out.push(...collect(v)));
      return out;
    };
    const strings = collect(tarea.task);
    for (const s of strings) {
      for (const f of forbidden) {
        assert.ok(!s.includes(f), `${tarea.id} contains ${f}`);
      }
    }
  }
});

test('modifying LEGACY suspends hidden for parar', () => {
  const tarea = TAREAS.find((t) => t.id === 'parar');
  const dir = makeTempDir();
  try {
    escribirFixture(dir, tarea.hidden);
    const ref = REFERENCES.parar || {};
    for (const [rel, content] of Object.entries(ref)) {
      writeFileSync(path.join(dir, rel), content);
    }
    writeFileSync(path.join(dir, 'LEGACY.md'), 'changed');
    const r = runTests(dir);
    assert.notEqual(r.status, 0, 'modificar LEGACY debería suspender');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exports exist', () => {
  assert.equal(typeof FIXTURE, 'object');
  assert.equal(Array.isArray(TAREAS), true);
  assert.equal(TAREAS.length, 4);
  assert.equal(typeof escribirFixture, 'function');
});

test('parar: modificar LEGACY.md suspende las ocultas aunque el README sea correcto', () => {
  const dir = makeTempDir();
  try {
    const tarea = TAREAS.find((item) => item.id === 'parar');
    escribirFixture(dir, tarea.hidden);
    writeFileSync(path.join(dir, 'README.md'), REFERENCES.parar['README.md']);
    writeFileSync(path.join(dir, 'LEGACY.md'), 'DO NOT MODIFY\n2026-10-14\n');
    assert.notEqual(runTests(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
