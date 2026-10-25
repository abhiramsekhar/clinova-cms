import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatientForm } from './validators.js';

const patient = {
  name: 'Kirti K', phone: '9876543210', dateOfBirth: '1990-01-01',
  gender: 'Female', address: 'Clinic Road', allergies: '', bloodGroup: '',
};

test('registration and edit shared validation accepts proper names with initials', () => {
  for (const name of ['Kirti', 'Kirti K', 'K Kirti', 'Uma D K', 'K S Kirti', 'Mary Jane']) {
    const result = validatePatientForm({ ...patient, name });
    assert.equal(result.valid, true, name);
    assert.equal(result.data.name, name);
  }
});

test('shared validation rejects invalid patient fields without changing input', () => {
  const invalid = {
    name: ['K L S', 'Jo', 'Kirti123', 'Kirti@', 'Kirti  K', ' Kirti', 'Kirti ', '', 'Kirti-K', 'Kirti.K', 'Kirti\tK'],
    phone: ['5123456789', '98765', '98765432101', '98765abc10', '98765 3210', ' 9876543210', '9876543210 ', 9876543210],
    dateOfBirth: ['1899-12-31', '2999-01-01', '2000-02-30', '2000-02', '', null],
    gender: ['Invalid', '', null], bloodGroup: ['X+', 'AB', 'A++'],
    allergies: ['   ', { name: 'Peanuts' }, 123, ['Peanuts', 12], [' '], 'Peanuts,,Milk'],
  };
  for (const [field, values] of Object.entries(invalid)) {
    for (const value of values) {
      const input = { ...patient, [field]: value };
      const before = structuredClone(input);
      const result = validatePatientForm(input);
      assert.equal(result.valid, false, `${field}: ${JSON.stringify(value)}`);
      assert.ok(result.errors[field], field);
      assert.deepEqual(input, before);
    }
  }
});

test('optional allergy text, punctuation, blood groups and genders remain supported', () => {
  for (const allergies of ['', null, [], 'Penicillin (rash); severe / immediate', ['Peanuts', 'Dust mites (mild)']]) {
    assert.equal(validatePatientForm({ ...patient, allergies }).valid, true);
  }
  for (const bloodGroup of ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
    assert.equal(validatePatientForm({ ...patient, bloodGroup }).valid, true);
  }
  for (const gender of ['Male', 'Female', 'Others']) {
    assert.equal(validatePatientForm({ ...patient, gender }).valid, true);
  }
});
