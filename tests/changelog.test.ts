import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CHANGELOG, compareVersions, entriesSince } from '../src/lib/changelog';
import { HELP_TOPICS } from '../src/lib/help';

const require = createRequire(import.meta.url);
const logic = require('../electron/logic.cjs');

describe('changelog', () => {
  it('has an entry for the version in package.json (add one before every release)', () => {
    const v = JSON.parse(readFileSync('package.json', 'utf8')).version;
    expect(CHANGELOG.some((e) => e.version === v)).toBe(true);
  });

  it('is sorted newest first and every entry has notes', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    for (const e of CHANGELOG) expect(e.items.length).toBeGreaterThan(0);
  });

  it('compares versions numerically and lists only newer entries', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(entriesSince('1.0.0', '1.0.0')).toEqual([]);
    expect(entriesSince('0.9.0', '1.0.0').map((e) => e.version)).toEqual(['1.0.0']);
  });

  it('the app (main process) and the UI agree on version order', () => {
    for (const [a, b] of [['0.10.0', '0.9.9'], ['1.0.0', '1.0.0'], ['1.2.0', '1.10.0'], ['2.0.0-beta.1', '1.9.9']]) {
      expect(Math.sign(logic.compareVersions(a, b))).toBe(Math.sign(compareVersions(a, b)));
    }
  });
});

describe('start-up kind (decides whether to open Help / What\'s new)', () => {
  it('first run, updated and normal launches', () => {
    expect(logic.launchKind('', '1.0.0')).toBe('first-run');
    expect(logic.launchKind(undefined, '1.0.0')).toBe('first-run');
    expect(logic.launchKind('1.0.0', '1.0.1')).toBe('updated');
    expect(logic.launchKind('1.0.0', '1.0.0')).toBe('normal');
    expect(logic.launchKind('1.1.0', '1.0.0')).toBe('normal'); // downgrade stays quiet
  });
});

describe('help guide', () => {
  it('has the topics the release promised, each with content', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['start', 'standalone', 'm3', 'obs', 'dock', 'tray', 'trouble']));
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) {
      expect(t.sections.length).toBeGreaterThan(0);
      for (const s of t.sections) expect((s.steps?.length ?? 0) + (s.paragraphs?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});
