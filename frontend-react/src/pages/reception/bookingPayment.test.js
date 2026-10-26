import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookingPaymentFields, initialBookingPayment } from './bookingPayment.js';

test('prior booking renders no payment dropdown or collection instructions', () => {
  const html = renderToStaticMarkup(React.createElement(BookingPaymentFields, { mode: 'PRIOR', paymentMethod: 'CASH', onChange() {} }));
  assert.equal(html, '');
  assert.deepEqual(initialBookingPayment('PRIOR', { total: 70000 }, 'CASH'), {});
});

test('walk-in preserves required payment controls and confirmed payment payload', () => {
  const html = renderToStaticMarkup(React.createElement(BookingPaymentFields, { mode: 'WALK_IN', paymentMethod: 'CASH', onChange() {} }));
  assert.match(html, /Payment Method/);
  assert.match(html, /<select[^>]*required/);
  assert.match(html, /value="CASH"/);
  assert.match(html, /full bill/);
  assert.deepEqual(initialBookingPayment('WALK_IN', { total: 70000 }, 'CASH'), {
    expectedTotal: 70000, payment: { method: 'CASH', confirmed: true },
  });
});
