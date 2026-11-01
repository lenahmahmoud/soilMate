import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSeedData } from '../../src/data/loadSeedData.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'seed-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name, data) => writeFileSync(path.join(dir, name), JSON.stringify(data));

describe('loadSeedData', () => {
  test('lists every missing file', () => {
    expect(() => loadSeedData(dir, path.join(dir, 'icon-keys.json'))).toThrow(
      /Missing seed files[\s\S]*g2\.json[\s\S]*icon-keys\.json/,
    );
  });

  test('loads arrays, { questions } objects and a { keys } icon list', () => {
    write('games.json', [{ slug: 'a' }]);
    write('g1.json', [{ key: 'g1-001' }]);
    for (const n of ['g2', 'g3', 'g4', 'g5']) write(`${n}.json`, { questions: [{ key: `${n}-001` }] });
    write('icon-keys.json', { keys: ['x', 'y'] });

    const data = loadSeedData(dir, path.join(dir, 'icon-keys.json'));
    expect(data.games).toHaveLength(1);
    expect(data.questions).toHaveLength(5);
    expect(data.iconKeys).toEqual(['x', 'y']);
  });
});