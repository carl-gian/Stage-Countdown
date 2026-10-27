import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { m3Label } from '../src/lib/m3label';

const require = createRequire(import.meta.url);
const { DOCK_HTML } = require('../electron/dock-page.cjs');

describe('M³ badge wording', () => {
  it('says exactly "M³ Media Display Shown" or "M³ Media Display Hidden"', () => {
    expect(m3Label({ media: 'shown' }).text).toBe('M³ Media Display Shown');
    expect(m3Label({ media: 'hidden' }).text).toBe('M³ Media Display Hidden');
  });

  it('a media window that is not open counts as Hidden', () => {
    expect(m3Label({ media: 'none' }).text).toBe('M³ Media Display Hidden');
  });

  it('falls back to the best guess when the real state cannot be read', () => {
    expect(m3Label({ media: 'unknown', hidden: false })).toMatchObject({ word: 'Shown', guessed: true });
    expect(m3Label({ media: 'unknown', hidden: true })).toMatchObject({ word: 'Hidden', guessed: true });
    expect(m3Label({ media: 'shown' }).guessed).toBe(false);
  });

  it('the OBS dock uses the same wording', () => {
    expect(DOCK_HTML).toContain("'M³ Media Display Shown'");
    expect(DOCK_HTML).toContain("'M³ Media Display Hidden'");
  });
});
