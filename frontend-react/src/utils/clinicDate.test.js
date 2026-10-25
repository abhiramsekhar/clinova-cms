import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicDateString } from './clinicDate.js';

test('clinic date follows the configured default timezone rather than UTC', () => {
  assert.equal(clinicDateString(new Date('2026-01-01T20:00:00.000Z')), '2026-01-02');
  assert.equal(clinicDateString(new Date('2026-01-02T18:00:00.000Z')), '2026-01-02');
});
