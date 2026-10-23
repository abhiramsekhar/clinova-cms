/**
 * Clinova Healthcare — Form validators
 * Each validateX returns { valid, value, error }.
 */

export const MIN_YEAR = 1900;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

const ok = (value) => ({ valid: true, value, error: '' });
const fail = (error) => ({ valid: false, value: null, error });

export function ageFromDob(dob) {
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
  if (v.length < 2) return fail(`${label} must be at least 2 characters.`);
  if (v.length > 60) return fail(`${label} must be at most 60 characters.`);
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(v)) return fail(`${label} contains invalid characters.`);
  return ok(v);
}

export function validatePhone(raw, label = 'Phone number') {
  const v = String(raw ?? '').trim();
  if (!v) return fail(`${label} is required.`);
  if (!/^\+?[\d\s()-]+$/.test(v)) return fail(`${label} contains invalid characters.`);
  const digits = v.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return fail(`${label} must have 10–15 digits.`);
  return ok(v);
}

export function validateDob(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return fail('Date of birth is required.');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return fail('Enter a valid date of birth.');
  if (d.getFullYear() < MIN_YEAR) return fail(`Year must be ${MIN_YEAR} or later.`);
  if (d > new Date()) return fail('Date of birth cannot be in the future.');
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
  if (v.length > 200) return fail('Address must be at most 200 characters.');
  return ok(v);
}

/** Returns value as an array of strings. */
export function validateAllergies(raw) {
  const list = String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length > 20) return fail('Too many allergies (max 20).');
  if (list.some(a => a.length > 40)) return fail('Each allergy must be at most 40 characters.');
  if (list.some(a => !/^[\p{L}\p{M}\d\s.'’()-]+$/u.test(a))) return fail('Allergies contain invalid characters.');
  return ok(list);
}

export function validateBloodGroup(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return ok(null);
  if (!BLOOD_GROUPS.includes(v)) return fail('Select a valid blood group.');
  return ok(v);
}

/** Validates the whole registration form. Returns { valid, errors, data }. */
export function validatePatientForm(input) {
  const errors = {};
  const data = {};
  const run = (field, res) => { if (res.valid) data[field] = res.value; else errors[field] = res.error; };

  run('name', validateName(input.name, 'Full name'));
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