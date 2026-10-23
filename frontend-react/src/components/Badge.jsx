import React from 'react';

const STATUS_COLORS = {
  // Appointments & Consultations
  COMPLETED: 'success',
  CHECKED_IN: 'primary',
  IN_PROGRESS: 'primary',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
  SCHEDULED: 'warning',

  // Prescriptions / Pharmacy
  DISPENSED: 'success',
  PARTIALLY_DISPENSED: 'warning',
  PENDING: 'warning',

  // Lab
  ORDERED: 'warning',
  SAMPLE_COLLECTED: 'primary',
  PROCESSING: 'primary',

  // Bills & Payments
  PAID: 'success',
  UNPAID: 'danger',
  PARTIAL: 'warning',

  // General
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};

export function Badge({ status, variant, children, className = '' }) {
  const normStatus = status ? String(status).toUpperCase() : '';
  const color = variant || STATUS_COLORS[normStatus] || 'neutral';
  const label = children || (status ? String(status).replace(/_/g, ' ') : '');

  return (
    <span className={`badge badge--${color} ${className}`.trim()}>
      {label}
    </span>
  );
}

export default Badge;
