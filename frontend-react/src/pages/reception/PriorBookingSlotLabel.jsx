import React from 'react';

export function PriorBookingSlotLabel({ slot }) {
  return <small style={{ fontSize: '0.65rem' }}>Token #{slot.token} ({slot.state === 'booked' ? 'Reserved' : 'Preview'})</small>;
}
