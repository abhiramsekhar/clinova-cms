import React from 'react';

export function BookingPaymentFields({ mode, paymentMethod, onChange }) {
  if (mode !== 'WALK_IN') return null;
  return React.createElement(React.Fragment, null,
    React.createElement('label', { className: 'form-field' }, 'Payment Method',
      React.createElement('select', { className: 'form-input', value: paymentMethod, required: true, onChange },
        React.createElement('option', { value: 'CASH' }, 'Cash'),
        React.createElement('option', { value: 'CARD' }, 'Credit / Debit Card'),
        React.createElement('option', { value: 'UPI' }, 'UPI (Google Pay, PhonePe, Paytm)'))),
    React.createElement('p', { className: 'text-caption' },
      'Confirm collection for the full bill. The appointment token is issued after the payment is saved.'));
}

export function initialBookingPayment(mode, quote, paymentMethod) {
  return mode === 'WALK_IN'
    ? { expectedTotal: quote.total, payment: { method: paymentMethod, confirmed: true } }
    : {};
}
