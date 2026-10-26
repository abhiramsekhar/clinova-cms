import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
const path = new URL('./PriorBookingSlotLabel.jsx', import.meta.url);
const result = await transformWithOxc(await readFile(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
const code = result.code.replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')));
const { PriorBookingSlotLabel } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const render = slot => renderToStaticMarkup(React.createElement(PriorBookingSlotLabel, { slot }));

test('every prior time option displays only its time and unchanged token preview', () => {
  for (let index = 0; index < 16; index += 1) {
    const minutes = 9 * 60 + index * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const slot = { time, index, token: index + 2, state: 'free' };
    const original = { ...slot };
    const markup = renderToStaticMarkup(React.createElement('button', null,
      React.createElement('span', null, time), React.createElement(PriorBookingSlotLabel, { slot })));
    assert.match(markup, new RegExp(`Token #${index + 2} \\(Preview\\)`));
    assert.ok(markup.includes(time));
    assert.doesNotMatch(markup, /Slot #|Reserved|Issued|Confirmed|Unavailable/);
    assert.deepEqual(slot, original);
  }
});

test('booked prior options display Reserved without claiming payment or token confirmation', () => {
  const slot = { time: '09:30', index: 1, token: 1, state: 'booked', appointmentId: 'prior-unpaid' };
  const original = { ...slot };
  const markup = render(slot);
  assert.match(markup, /Token #1 \(Reserved\)/);
  assert.doesNotMatch(markup, /Slot #|Preview|Issued|Confirmed/);
  assert.deepEqual(slot, original);
});

test('empty-day and past options retain their backend token values without extra labels', () => {
  for (const state of ['free', 'past']) {
    const markup = render({ time: '09:00', index: 0, token: 1, state });
    assert.match(markup, /Token #1 \(Preview\)/);
    assert.doesNotMatch(markup, /Slot #|Unavailable|Reserved/);
  }
});
