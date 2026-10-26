import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

async function loadJsx(relative) {
  const filename = new URL(relative, import.meta.url);
  const source = await readFile(filename, 'utf8');
  const transformed = await transformWithOxc(source, filename.pathname, { jsx: { runtime: 'classic' } });
  const code = transformed.code.replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { RebookedAction } = await loadJsx('./RebookedAction.jsx');
const { Badge } = await loadJsx('../../components/Badge.jsx');

test('rebooked status uses the Checked In blue badge without altering No-show', () => {
  const markup = renderToStaticMarkup(React.createElement(Badge, { status: 'REBOOKED' }));
  assert.match(markup, /badge--primary/);
  assert.match(markup, /Arrived Late \(Rebooked\)/);
  assert.match(renderToStaticMarkup(React.createElement(Badge, { status: 'NO_SHOW' })), /badge--warning/);
});

test('persisted rebooking shows View New Booking and opens only the linked appointment', () => {
  const appointment = JSON.parse(JSON.stringify({ bookingMode: 'PRIOR', status: 'REBOOKED', lateArrivalHandled: true, replacementAppointmentId: 'APT-replacement' }));
  let viewed;
  const element = RebookedAction({ appointment, onView: id => { viewed = id; } });
  const markup = renderToStaticMarkup(element);
  assert.match(markup, /View New Booking/);
  assert.doesNotMatch(markup, /Report Late Arrival/);
  element.props.onClick();
  assert.equal(viewed, 'APT-replacement');
});

test('handled legacy rows cannot report again, including when a link is missing', () => {
  const markup = renderToStaticMarkup(React.createElement(RebookedAction, {
    appointment: { bookingMode: 'PRIOR', status: 'NO_SHOW', lateArrivalHandled: true },
  }));
  assert.match(markup, /Late Arrival Handled/);
  assert.doesNotMatch(markup, /button/);
  assert.equal(RebookedAction({ appointment: { bookingMode: 'PRIOR', status: 'NO_SHOW' } }), null);
  assert.equal(RebookedAction({ appointment: { bookingMode: 'WALK_IN', status: 'NO_SHOW' } }), null);
});
