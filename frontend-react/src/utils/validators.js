/**
 * Clinova Healthcare — Form validators ported from legacy core/validators.js
 * Each validateX returns { valid, value, error }.
 */

export const MIN_YEAR = 1900;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const GENDERS = ['Male', 'Female', 'Others'];

const ok = (value) => ({ valid: true, value, error: '' });
const fail = (error) => ({ valid: false, value: null, error });

export function ageFromDob(dob) {
  if (!dob) return 0;
  const b = new Date(dob);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

export function validateName(raw, label = 'Name') {
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return fail(`${label} is required.`);
  if ([...v].filter((char) => /[\p{L}\p{M}]/u.test(char)).length < 2) return fail(`${label} must contain at least two letters.`);
  if (v.length > 100) return fail(`${label} must be at most 100 characters.`);
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(v)) return fail(`${label} contains invalid characters.`);
  return ok(v);
}

export function validatePatientName(raw, label = 'Name') {
  if (typeof raw !== 'string' || !raw) return fail(`${label} is required.`);
  if (raw.length > 100) return fail(`${label} must be at most 100 characters.`);
  if (!/^[\p{L}][\p{L}\p{M}]*(?: [\p{L}][\p{L}\p{M}]*)*$/u.test(raw)) return fail(`${label} must contain only letters with single spaces, without leading or trailing spaces.`);
  const letters = value => [...value].filter(char => /\p{L}/u.test(char)).length;
  if (letters(raw) < 3 || !raw.split(' ').some(part => letters(part) >= 2)) return fail(`${label} needs at least 3 letters and a proper name, not only single-letter initials.`);
  return ok(raw.trim());
}

export function validatePhone(raw, label = 'Phone number') {
  const v = typeof raw === 'string' ? raw : '';
  if (!v) return fail(`${label} is required.`);
  if (!/^[6-9]\d{9}$/.test(v)) return fail(`${label} must be exactly 10 digits and start with 6, 7, 8, or 9.`);
  return ok(v);
}

export function validateDob(raw) {
  const v = typeof raw === 'string' ? raw : '';
  if (!v) return fail('Date of birth is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail('Enter a complete valid date of birth.');
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v || Number(v.slice(0, 4)) < MIN_YEAR) return fail(`Enter a valid date from ${MIN_YEAR} onward.`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: import.meta.env?.VITE_CLINIC_TIME_ZONE || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (v > today) return fail('Date of birth cannot be in the future.');
  return ok(v);
}

export function validateGender(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return fail('Gender is required.');
  if (!GENDERS.includes(v)) return fail('Select a valid gender.');
  return ok(v);
}

export function validateAddress(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return fail('Address is required.');
  if (v.length > 500) return fail('Address must be at most 500 characters.');
  return ok(v);
}

/** Preserve the existing array API while validating text entries. */
export function validateAllergies(raw) {
  if (raw == null || raw === '') return ok([]);
  if (typeof raw !== 'string' && !Array.isArray(raw)) return fail('Allergies must be text or a list of text entries.');
  const entries = Array.isArray(raw) ? raw : raw.split(',');
  if (entries.some(entry => typeof entry !== 'string' || !entry.trim())) return fail('Allergy entries cannot be blank or whitespace-only.');
  const list = entries.map(entry => entry.trim());
  if (list.join(', ').length > 1000) return fail('Allergy information must be at most 1000 characters.');
  if (list.length > 20) return fail('Too many allergies (max 20).');
  if (list.some(entry => entry.length > 100)) return fail('Each allergy must be at most 100 characters.');
  return ok(list);
}

export function validateBloodGroup(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return ok(null);
  if (!BLOOD_GROUPS.includes(v)) return fail('Select a valid blood group.');
  return ok(v);
}

/** Validates the whole patient registration form. Returns { valid, errors, data }. */
export function validatePatientForm(input) {
  const errors = {};
  const data = {};
  const run = (field, res) => {
    if (res.valid) {
      data[field] = res.value;
    } else {
      errors[field] = res.error;
    }
  };

  run('name', validatePatientName(input.name, 'Full name'));
  run('phone', validatePhone(input.phone));
  run('dateOfBirth', validateDob(input.dateOfBirth));
  run('gender', validateGender(input.gender));
  run('address', validateAddress(input.address));
  run('allergies', validateAllergies(input.allergies));
  run('bloodGroup', validateBloodGroup(input.bloodGroup));

  const isMinor = data.dateOfBirth && ageFromDob(data.dateOfBirth) < 18;
  if (isMinor) {
    run('guardianName', validateName(input.guardianName, 'Guardian name'));
    run('guardianPhone', validatePhone(input.guardianPhone, 'Guardian phone'));
  } else {
    data.guardianName = null;
    data.guardianPhone = null;
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}
