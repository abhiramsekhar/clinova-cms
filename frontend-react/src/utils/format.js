import { formatPaise, paiseToRupees, rupeesToPaise } from './money';

export { formatPaise, paiseToRupees, rupeesToPaise };

export function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatTime(timeStr) {
  if (!timeStr) return '-';
  try {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(Number(h), Number(m), 0, 0);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return timeStr;
  }
}

export function formatAge(dob) {
  if (!dob) return '-';
  try {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} yrs`;
  } catch {
    return '-';
  }
}

export function displayName(name, role) {
  if (!name) return '';
  const trimmed = name.trim();
  if (role === 'DOCTOR' && !trimmed.toLowerCase().startsWith('dr.')) {
    return `Dr. ${trimmed}`;
  }
  return trimmed;
}

export function getInitials(name) {
  if (!name) return 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const Format = {
  date: formatDate,
  datetime: formatDateTime,
  time: formatTime,
  age: formatAge,
  money: formatPaise,
  displayName,
  getInitials,
};
