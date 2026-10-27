import { describe, expect, it } from 'vitest';
import { autoCloseBlockedByObs } from '../src/lib/autoClose';
import { fitRing } from '../src/lib/fitSize';

describe('close-after-timer vs OBS', () => {
  it('is blocked only while OBS scene switching is on AND connected', () => {
    expect(autoCloseBlockedByObs({ enabled: true, state: 'connected' })).toBe(true);
    expect(autoCloseBlockedByObs({ enabled: true, state: 'searching' })).toBe(false);
    expect(autoCloseBlockedByObs({ enabled: true, state: 'auth-failed' })).toBe(false);
    expect(autoCloseBlockedByObs({ enabled: false, state: 'connected' })).toBe(false);
    expect(autoCloseBlockedByObs(null)).toBe(false);
    expect(autoCloseBlockedByObs(undefined)).toBe(false);
  });
});

describe('ring size that fits the controller', () => {
  it('fits the smaller side and leaves room for the glow', () => {
    expect(fitRing(480, 300)).toBe(260);
    expect(fitRing(300, 480)).toBe(260);
  });

  it('never gets absurdly small or large', () => {
    expect(fitRing(100, 60)).toBe(110);
    expect(fitRing(2000, 2000)).toBe(520);
  });
});
