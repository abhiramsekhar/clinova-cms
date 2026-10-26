import React from 'react';

export function RebookedAction({ appointment, onView }) {
  if (appointment.bookingMode === 'WALK_IN' || !(appointment.status === 'REBOOKED' || appointment.lateArrivalHandled)) return null;
  return appointment.replacementAppointmentId
    ? <button type="button" className="appointment-action" onClick={() => onView(appointment.replacementAppointmentId)}>View New Booking</button>
    : <span>Late Arrival Handled</span>;
}
