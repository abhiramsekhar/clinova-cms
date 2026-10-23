/**
 * Clinova Healthcare — Seed Data
 *
 * Deterministic demo data with dates relative to today.
 * Run seed() to populate all collections; safe to re-run (replaces all data).
 */

import { db } from './db.js';

/* ── Date helpers (relative to today) ── */
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
function d(offset) { const dt = new Date(TODAY); dt.setDate(dt.getDate() + offset); return dt.toISOString().slice(0,10); }
function iso(offset, h=9, m=0) { const dt = new Date(TODAY); dt.setDate(dt.getDate()+offset); dt.setHours(h,m,0,0); return dt.toISOString(); }
function pastDate(daysAgo) { return d(-daysAgo); }
const NOW = new Date().toISOString();

/* ── Password pre-hashing ──
 * We use pre-computed PBKDF2 hashes so seed is synchronous-friendly.
 * The auth module re-derives at login. We store raw hash+salt pairs
 * computed offline for the demo passwords.
 * Since we can't call async from top-level sync seed easily,
 * we'll use a simpler demo hash for seed and re-hash at runtime.
 */

// For the demo, we pre-compute using a sync-safe approach:
// We'll actually make seed() async and hash properly.

export async function seed() {
  // Hash helper using Web Crypto
  async function hashPw(password) {
    const enc = new TextEncoder();
    const saltArr = new Uint8Array(16);
    // Use deterministic salt based on password for reproducibility
    for (let i = 0; i < 16; i++) saltArr[i] = password.charCodeAt(i % password.length) ^ (i * 37);
    const salt = Array.from(saltArr).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return { hash, salt };
  }

  const pwAdmin    = await hashPw('Admin@123');
  const pwDoctor   = await hashPw('Doctor@123');
  const pwReception= await hashPw('Reception@123');
  const pwPharmacy = await hashPw('Pharmacy@123');
  const pwLab      = await hashPw('Lab@123');

  /* ══════════ DEPARTMENTS ══════════ */
  const departments = [
    { id: 'dept-01', name: 'General Medicine',    code: 'GM',   headDoctorId: 'staff-doc-01', isActive: true, isBookable: true, defaultFee: 50000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
    { id: 'dept-02', name: 'Paediatrics',         code: 'PED',  headDoctorId: 'staff-doc-02', isActive: true, isBookable: true, defaultFee: 60000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
    { id: 'dept-03', name: 'Dermatology',          code: 'DER',  headDoctorId: 'staff-doc-03', isActive: true, isBookable: true, defaultFee: 70000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
    { id: 'dept-04', name: 'Orthopaedics',         code: 'ORT',  headDoctorId: 'staff-doc-04', isActive: true, isBookable: true, defaultFee: 80000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
    { id: 'dept-05', name: 'ENT',                  code: 'ENT',  headDoctorId: 'staff-doc-05', isActive: true, isBookable: true, defaultFee: 65000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
    { id: 'dept-06', name: 'Gynaecology',          code: 'GYN',  headDoctorId: 'staff-doc-06', isActive: true, isBookable: true, defaultFee: 75000, createdAt: iso(-180), updatedAt: NOW, _v: 1 },
  ];

  /* ══════════ STAFF ══════════ */
  const staff = [
    // Admin
    { id: 'staff-admin-01', name: 'Rajesh Kumar',            designation: 'System Administrator',  departmentId: null,       role: 'ADMIN',        phone: '+91-9876543210', email: 'rajesh@clinova.in',   avatarUrl: '../../assets/images/staff/admin-rajesh.svg', isActive: true,  joinedAt: iso(-365), createdAt: iso(-365), updatedAt: NOW, _v: 1 },
    // Doctors
    { id: 'staff-doc-01',   name: 'Dr. Sarah Thomas',        designation: 'Senior Physician',      departmentId: 'dept-01',  role: 'DOCTOR',       phone: '+91-9845123456', email: 'sarah@clinova.in',    avatarUrl: '../../assets/images/staff/dr-sarah-thomas.svg',     isActive: true,  joinedAt: iso(-300), createdAt: iso(-300), updatedAt: NOW, _v: 1 },
    { id: 'staff-doc-02',   name: 'Dr. Priya Nambiar',       designation: 'Paediatrician',         departmentId: 'dept-02',  role: 'DOCTOR',       phone: '+91-9845234567', email: 'priya@clinova.in',    avatarUrl: '../../assets/images/staff/dr-priya-nambiar.svg',    isActive: true,  joinedAt: iso(-280), createdAt: iso(-280), updatedAt: NOW, _v: 1 },
    { id: 'staff-doc-03',   name: 'Dr. Anil Kumar',          designation: 'Dermatologist',         departmentId: 'dept-03',  role: 'DOCTOR',       phone: '+91-9845345678', email: 'anil@clinova.in',     avatarUrl: '../../assets/images/staff/dr-anil-kumar.svg',       isActive: true,  joinedAt: iso(-260), createdAt: iso(-260), updatedAt: NOW, _v: 1 },
    { id: 'staff-doc-04',   name: 'Dr. Meera Krishnan',      designation: 'Orthopaedic Surgeon',   departmentId: 'dept-04',  role: 'DOCTOR',       phone: '+91-9845456789', email: 'meera@clinova.in',    avatarUrl: '../../assets/images/staff/dr-meera-krishnan.svg',   isActive: true,  joinedAt: iso(-240), createdAt: iso(-240), updatedAt: NOW, _v: 1 },
    { id: 'staff-doc-05',   name: 'Dr. Faisal Rahman',       designation: 'ENT Specialist',        departmentId: 'dept-05',  role: 'DOCTOR',       phone: '+91-9845567890', email: 'faisal@clinova.in',   avatarUrl: '../../assets/images/staff/dr-faisal-rahman.svg',    isActive: true,  joinedAt: iso(-220), createdAt: iso(-220), updatedAt: NOW, _v: 1 },
    { id: 'staff-doc-06',   name: 'Dr. Sreelakshmi Nair',    designation: 'Gynaecologist',         departmentId: 'dept-06',  role: 'DOCTOR',       phone: '+91-9845678901', email: 'sreelakshmi@clinova.in', avatarUrl: '../../assets/images/staff/dr-sreelakshmi-nair.svg', isActive: true, joinedAt: iso(-200), createdAt: iso(-200), updatedAt: NOW, _v: 1 },
    // Receptionists
    { id: 'staff-rec-01',   name: 'Anjali Menon',            designation: 'Senior Receptionist',   departmentId: null,       role: 'RECEPTIONIST', phone: '+91-9846123456', email: 'anjali@clinova.in',   avatarUrl: '../../assets/images/staff/reception-anjali.svg',    isActive: true,  joinedAt: iso(-350), createdAt: iso(-350), updatedAt: NOW, _v: 1 },
    { id: 'staff-rec-02',   name: 'Deepa Vijayan',           designation: 'Receptionist',          departmentId: null,       role: 'RECEPTIONIST', phone: '+91-9846234567', email: 'deepa@clinova.in',    avatarUrl: '../../assets/images/staff/reception-deepa.svg',     isActive: true,  joinedAt: iso(-330), createdAt: iso(-330), updatedAt: NOW, _v: 1 },
    // Pharmacists
    { id: 'staff-pharm-01', name: 'Lakshmi Devi',            designation: 'Chief Pharmacist',      departmentId: null,       role: 'PHARMACIST',   phone: '+91-9847123456', email: 'lakshmi@clinova.in',  avatarUrl: '../../assets/images/staff/pharmacy-lakshmi.svg',    isActive: true,  joinedAt: iso(-340), createdAt: iso(-340), updatedAt: NOW, _v: 1 },
    { id: 'staff-pharm-02', name: 'Vishnu Prasad',           designation: 'Pharmacist',            departmentId: null,       role: 'PHARMACIST',   phone: '+91-9847234567', email: 'vishnu@clinova.in',   avatarUrl: '../../assets/images/staff/pharmacy-vishnu.svg',     isActive: true,  joinedAt: iso(-310), createdAt: iso(-310), updatedAt: NOW, _v: 1 },
    // Lab Technicians
    { id: 'staff-lab-01',   name: 'Arjun Pillai',            designation: 'Senior Lab Technician', departmentId: null,       role: 'LAB_TECH',     phone: '+91-9848123456', email: 'arjun@clinova.in',    avatarUrl: '../../assets/images/staff/lab-arjun.svg',           isActive: true,  joinedAt: iso(-320), createdAt: iso(-320), updatedAt: NOW, _v: 1 },
    { id: 'staff-lab-02',   name: 'Divya Suresh',            designation: 'Lab Technician',        departmentId: null,       role: 'LAB_TECH',     phone: '+91-9848234567', email: 'divya@clinova.in',    avatarUrl: '../../assets/images/staff/lab-divya.svg',           isActive: true,  joinedAt: iso(-290), createdAt: iso(-290), updatedAt: NOW, _v: 1 },
    // Deactivated account
    { id: 'staff-deact-01', name: 'Dr. Ramesh Babu',         designation: 'Physician (Resigned)',  departmentId: 'dept-01',  role: 'DOCTOR',       phone: '+91-9849999999', email: 'ramesh@clinova.in',   avatarUrl: null,                                                 isActive: false, joinedAt: iso(-500), createdAt: iso(-500), updatedAt: iso(-30), _v: 2 },
  ];

  /* ══════════ USERS ══════════ */
  const users = [
    { id: 'user-admin',    username: 'admin',      passwordHash: pwAdmin.hash,      salt: pwAdmin.salt,      role: 'ADMIN',        staffId: 'staff-admin-01',  isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,8,30), createdAt: iso(-365), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-01',   username: 'dr.sarah',   passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-01',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,9,0),  createdAt: iso(-300), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-02',   username: 'dr.priya',   passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-02',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-2,9,0),  createdAt: iso(-280), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-03',   username: 'dr.anil',    passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-03',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,10,0), createdAt: iso(-260), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-04',   username: 'dr.meera',   passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-04',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-3,9,30), createdAt: iso(-240), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-05',   username: 'dr.faisal',  passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-05',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,8,45), createdAt: iso(-220), updatedAt: NOW, _v: 1 },
    { id: 'user-doc-06',   username: 'dr.sreelakshmi', passwordHash: pwDoctor.hash, salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-doc-06',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-2,10,0), createdAt: iso(-200), updatedAt: NOW, _v: 1 },
    { id: 'user-rec-01',   username: 'reception1', passwordHash: pwReception.hash,  salt: pwReception.salt,  role: 'RECEPTIONIST', staffId: 'staff-rec-01',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,7,30), createdAt: iso(-350), updatedAt: NOW, _v: 1 },
    { id: 'user-rec-02',   username: 'reception2', passwordHash: pwReception.hash,  salt: pwReception.salt,  role: 'RECEPTIONIST', staffId: 'staff-rec-02',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,8,0),  createdAt: iso(-330), updatedAt: NOW, _v: 1 },
    { id: 'user-pharm-01', username: 'pharmacy1',  passwordHash: pwPharmacy.hash,   salt: pwPharmacy.salt,   role: 'PHARMACIST',   staffId: 'staff-pharm-01',  isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,9,0),  createdAt: iso(-340), updatedAt: NOW, _v: 1 },
    { id: 'user-pharm-02', username: 'pharmacy2',  passwordHash: pwPharmacy.hash,   salt: pwPharmacy.salt,   role: 'PHARMACIST',   staffId: 'staff-pharm-02',  isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-2,9,0),  createdAt: iso(-310), updatedAt: NOW, _v: 1 },
    { id: 'user-lab-01',   username: 'lab1',       passwordHash: pwLab.hash,        salt: pwLab.salt,        role: 'LAB_TECH',     staffId: 'staff-lab-01',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,8,30), createdAt: iso(-320), updatedAt: NOW, _v: 1 },
    { id: 'user-lab-02',   username: 'lab2',       passwordHash: pwLab.hash,        salt: pwLab.salt,        role: 'LAB_TECH',     staffId: 'staff-lab-02',    isActive: true,  failedAttempts: 0, lockedUntil: null, lastLogin: iso(-1,9,30), createdAt: iso(-290), updatedAt: NOW, _v: 1 },
    // Deactivated
    { id: 'user-deact-01', username: 'dr.ramesh',  passwordHash: pwDoctor.hash,     salt: pwDoctor.salt,     role: 'DOCTOR',       staffId: 'staff-deact-01',  isActive: false, failedAttempts: 0, lockedUntil: null, lastLogin: iso(-60,9,0), createdAt: iso(-500), updatedAt: iso(-30), _v: 2 },
  ];

  /* ══════════ PATIENTS ══════════ */
  const patients = [
    { id: 'pat-01', mrn: 'CLN-2025-0001', name: 'Arun Nair',           dateOfBirth: '1985-03-14', gender: 'Male',   phone: '+91-9800100001', email: 'arun.nair@email.com',     address: '12 MG Road, Kochi',       bloodGroup: 'O+', allergies: ['Penicillin'], guardianName: null, guardianPhone: null, chronicConditions: ['Hypertension'], isActive: true, createdAt: iso(-120), updatedAt: NOW, _v: 1 },
    { id: 'pat-02', mrn: 'CLN-2025-0002', name: 'Sneha Pillai',        dateOfBirth: '1992-07-22', gender: 'Female', phone: '+91-9800100002', email: 'sneha.pillai@email.com',  address: '45 Marine Drive, Kochi',  bloodGroup: 'A+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-115), updatedAt: NOW, _v: 1 },
    { id: 'pat-03', mrn: 'CLN-2025-0003', name: 'Mohammed Rashid',     dateOfBirth: '1978-11-05', gender: 'Male',   phone: '+91-9800100003', email: null,                      address: '78 Calicut Rd, Malappuram', bloodGroup: 'B+', allergies: [],          guardianName: null, guardianPhone: null, chronicConditions: ['Type 2 Diabetes'], isActive: true, createdAt: iso(-110), updatedAt: NOW, _v: 1 },
    { id: 'pat-04', mrn: 'CLN-2025-0004', name: 'Lakshmi Subramaniam', dateOfBirth: '1965-01-30', gender: 'Female', phone: '+91-9800100004', email: 'lakshmi.s@email.com',     address: '23 Temple St, Thrissur',  bloodGroup: 'AB+', allergies: [],           guardianName: null, guardianPhone: null, chronicConditions: ['Hypothyroidism', 'Osteoarthritis'], isActive: true, createdAt: iso(-105), updatedAt: NOW, _v: 1 },
    { id: 'pat-05', mrn: 'CLN-2025-0005', name: 'Vishnu Prakash',      dateOfBirth: '1990-09-18', gender: 'Male',   phone: '+91-9800100005', email: 'vishnu.p@email.com',      address: '56 NH 66, Kollam',        bloodGroup: 'O-', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-100), updatedAt: NOW, _v: 1 },
    { id: 'pat-06', mrn: 'CLN-2025-0006', name: 'Fatima Beevi',        dateOfBirth: '1988-04-12', gender: 'Female', phone: '+91-9800100006', email: null,                      address: '89 Court Rd, Trivandrum', bloodGroup: 'A-', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: ['Asthma'],       isActive: true, createdAt: iso(-95),  updatedAt: NOW, _v: 1 },
    { id: 'pat-07', mrn: 'CLN-2025-0007', name: 'Rajan Varma',         dateOfBirth: '1975-12-25', gender: 'Male',   phone: '+91-9800100007', email: 'rajan.v@email.com',       address: '34 Park Ave, Kochi',      bloodGroup: 'B-', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: ['Hypertension'], isActive: true, createdAt: iso(-90),  updatedAt: NOW, _v: 1 },
    { id: 'pat-08', mrn: 'CLN-2025-0008', name: 'Gayathri Menon',      dateOfBirth: '1995-06-08', gender: 'Female', phone: '+91-9800100008', email: 'gayathri.m@email.com',    address: '67 Hill View, Munnar',    bloodGroup: 'O+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-85),  updatedAt: NOW, _v: 1 },
    { id: 'pat-09', mrn: 'CLN-2025-0009', name: 'Suresh Babu',         dateOfBirth: '1982-02-14', gender: 'Male',   phone: '+91-9800100009', email: null,                      address: '12 River Rd, Alappuzha',  bloodGroup: 'A+', allergies: ['Sulpha drugs'], guardianName: null, guardianPhone: null, chronicConditions: [],          isActive: true, createdAt: iso(-80),  updatedAt: NOW, _v: 1 },
    { id: 'pat-10', mrn: 'CLN-2025-0010', name: 'Anitha Krishnan',     dateOfBirth: '1998-10-20', gender: 'Female', phone: '+91-9800100010', email: 'anitha.k@email.com',      address: '45 Beach Rd, Varkala',    bloodGroup: 'AB-', allergies: [],           guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-75),  updatedAt: NOW, _v: 1 },
    { id: 'pat-11', mrn: 'CLN-2025-0011', name: 'Biju Thomas',         dateOfBirth: '1970-08-03', gender: 'Male',   phone: '+91-9800100011', email: 'biju.t@email.com',        address: '78 Church St, Kottayam',  bloodGroup: 'O+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: ['COPD'],          isActive: true, createdAt: iso(-70),  updatedAt: NOW, _v: 1 },
    { id: 'pat-12', mrn: 'CLN-2025-0012', name: 'Nisha George',        dateOfBirth: '1993-05-17', gender: 'Female', phone: '+91-9800100012', email: null,                      address: '23 Sunset Lane, Kannur',  bloodGroup: 'B+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-65),  updatedAt: NOW, _v: 1 },
    { id: 'pat-13', mrn: 'CLN-2025-0013', name: 'Prasad Namboodiri',   dateOfBirth: '1968-09-11', gender: 'Male',   phone: '+91-9800100013', email: 'prasad.n@email.com',      address: '56 Agrahara, Palakkad',   bloodGroup: 'A+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: ['Type 2 Diabetes', 'Hypertension'], isActive: true, createdAt: iso(-60), updatedAt: NOW, _v: 1 },
    { id: 'pat-14', mrn: 'CLN-2025-0014', name: 'Reshma Fathima',      dateOfBirth: '2000-01-25', gender: 'Female', phone: '+91-9800100014', email: 'reshma.f@email.com',      address: '89 Market Rd, Kasaragod', bloodGroup: 'O-', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-55),  updatedAt: NOW, _v: 1 },
    { id: 'pat-15', mrn: 'CLN-2025-0015', name: 'Jayan Mathew',        dateOfBirth: '1987-11-30', gender: 'Male',   phone: '+91-9800100015', email: null,                      address: '34 Railway Colony, Shoranur', bloodGroup: 'B+', allergies: [],       guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-50),  updatedAt: NOW, _v: 1 },
    { id: 'pat-16', mrn: 'CLN-2025-0016', name: 'Shalini Raj',         dateOfBirth: '1996-03-09', gender: 'Female', phone: '+91-9800100016', email: 'shalini.r@email.com',     address: '67 Lake Side, Kumarakom', bloodGroup: 'A-', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-45),  updatedAt: NOW, _v: 1 },
    { id: 'pat-17', mrn: 'CLN-2025-0017', name: 'Vinod Kumar',         dateOfBirth: '1980-07-14', gender: 'Male',   phone: '+91-9800100017', email: 'vinod.k@email.com',       address: '12 Fort Rd, Thiruvananthapuram', bloodGroup: 'AB+', allergies: [],   guardianName: null, guardianPhone: null, chronicConditions: ['Hypertension'], isActive: true, createdAt: iso(-40), updatedAt: NOW, _v: 1 },
    { id: 'pat-18', mrn: 'CLN-2025-0018', name: 'Deepa Mohan',         dateOfBirth: '1991-12-03', gender: 'Female', phone: '+91-9800100018', email: null,                      address: '45 Greenfield, Thrissur', bloodGroup: 'O+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-35),  updatedAt: NOW, _v: 1 },
    { id: 'pat-19', mrn: 'CLN-2025-0019', name: 'Ramesh Kumar',        dateOfBirth: '1973-04-28', gender: 'Male',   phone: '+91-9800100019', email: 'ramesh.k@email.com',      address: '78 Station Rd, Ernakulam', bloodGroup: 'B-', allergies: [],           guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-30),  updatedAt: NOW, _v: 1 },
    { id: 'pat-20', mrn: 'CLN-2025-0020', name: 'Kavitha Nair',        dateOfBirth: '1989-08-16', gender: 'Female', phone: '+91-9800100020', email: 'kavitha.n@email.com',     address: '23 MG Road, Kochi',       bloodGroup: 'A+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-25),  updatedAt: NOW, _v: 1 },
    // Duplicate-looking pair: same phone number
    { id: 'pat-21', mrn: 'CLN-2025-0021', name: 'Sreekanth R.',        dateOfBirth: '1986-06-10', gender: 'Male',   phone: '+91-9800100021', email: null,                      address: '56 Old Town, Kozhikode',  bloodGroup: 'O+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-20),  updatedAt: NOW, _v: 1 },
    { id: 'pat-22', mrn: 'CLN-2025-0022', name: 'Sreekanth Raghavan',  dateOfBirth: '1986-06-10', gender: 'Male',   phone: '+91-9800100021', email: 'sreekanth.r@email.com',   address: '56 Old Town, Kozhikode',  bloodGroup: 'O+', allergies: [],            guardianName: null, guardianPhone: null, chronicConditions: [],               isActive: true, createdAt: iso(-15),  updatedAt: NOW, _v: 1 },
    // Minors with guardians
    { id: 'pat-23', mrn: 'CLN-2025-0023', name: 'Aditi Menon',         dateOfBirth: d(-365*8),    gender: 'Female', phone: '+91-9800100023', email: null,                      address: '89 School Rd, Kochi',     bloodGroup: 'A+', allergies: [],            guardianName: 'Pradeep Menon', guardianPhone: '+91-9800100023', chronicConditions: [], isActive: true, createdAt: iso(-10), updatedAt: NOW, _v: 1 },
    { id: 'pat-24', mrn: 'CLN-2025-0024', name: 'Aryan Bhat',          dateOfBirth: d(-365*5),    gender: 'Male',   phone: '+91-9800100024', email: null,                      address: '34 Green Valley, Palakkad', bloodGroup: 'B+', allergies: [],          guardianName: 'Smitha Bhat',   guardianPhone: '+91-9800100024', chronicConditions: [], isActive: true, createdAt: iso(-5),  updatedAt: NOW, _v: 1 },
  ];

  /* ══════════ APPOINTMENTS (~45) ══════════ */
  const apptStatuses = ['SCHEDULED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW'];
  const appointments = [];
  const apptData = [
    // Past appointments (completed, no-show, cancelled)
    { pid:'pat-01', did:'staff-doc-01', dept:'dept-01', day:-14, time:'09:00', type:'Follow-up',    status:'COMPLETED', token:1, reason:'Blood pressure review' },
    { pid:'pat-02', did:'staff-doc-02', dept:'dept-02', day:-14, time:'09:30', type:'New Visit',    status:'COMPLETED', token:2, reason:'Child vaccination' },
    { pid:'pat-03', did:'staff-doc-01', dept:'dept-01', day:-13, time:'10:00', type:'Follow-up',    status:'COMPLETED', token:1, reason:'Diabetes check-up' },
    { pid:'pat-04', did:'staff-doc-04', dept:'dept-04', day:-12, time:'09:00', type:'New Visit',    status:'COMPLETED', token:1, reason:'Knee pain' },
    { pid:'pat-05', did:'staff-doc-03', dept:'dept-03', day:-11, time:'09:30', type:'New Visit',    status:'COMPLETED', token:1, reason:'Skin rash' },
    { pid:'pat-06', did:'staff-doc-01', dept:'dept-01', day:-10, time:'10:00', type:'Follow-up',    status:'NO_SHOW',   token:2, reason:'Asthma review' },
    { pid:'pat-07', did:'staff-doc-01', dept:'dept-01', day:-9,  time:'09:00', type:'Follow-up',    status:'COMPLETED', token:1, reason:'BP medication adjustment' },
    { pid:'pat-08', did:'staff-doc-06', dept:'dept-06', day:-8,  time:'09:30', type:'New Visit',    status:'COMPLETED', token:1, reason:'Annual check-up' },
    { pid:'pat-09', did:'staff-doc-01', dept:'dept-01', day:-7,  time:'10:00', type:'New Visit',    status:'CANCELLED', token:2, reason:'General consultation' },
    { pid:'pat-10', did:'staff-doc-05', dept:'dept-05', day:-7,  time:'09:00', type:'New Visit',    status:'COMPLETED', token:1, reason:'Ear pain' },
    { pid:'pat-11', did:'staff-doc-01', dept:'dept-01', day:-6,  time:'09:30', type:'Follow-up',    status:'COMPLETED', token:1, reason:'COPD management' },
    { pid:'pat-12', did:'staff-doc-03', dept:'dept-03', day:-5,  time:'10:00', type:'New Visit',    status:'COMPLETED', token:1, reason:'Acne treatment' },
    { pid:'pat-13', did:'staff-doc-01', dept:'dept-01', day:-4,  time:'09:00', type:'Follow-up',    status:'COMPLETED', token:1, reason:'Diabetes review' },
    { pid:'pat-14', did:'staff-doc-06', dept:'dept-06', day:-3,  time:'09:30', type:'New Visit',    status:'COMPLETED', token:1, reason:'Routine check-up' },
    { pid:'pat-15', did:'staff-doc-04', dept:'dept-04', day:-3,  time:'10:00', type:'New Visit',    status:'COMPLETED', token:2, reason:'Back pain' },
    { pid:'pat-16', did:'staff-doc-02', dept:'dept-02', day:-2,  time:'09:00', type:'Follow-up',    status:'COMPLETED', token:1, reason:'Follow-up visit' },
    { pid:'pat-17', did:'staff-doc-01', dept:'dept-01', day:-2,  time:'09:30', type:'Follow-up',    status:'COMPLETED', token:2, reason:'Hypertension management' },
    { pid:'pat-18', did:'staff-doc-05', dept:'dept-05', day:-1,  time:'10:00', type:'New Visit',    status:'COMPLETED', token:1, reason:'Sinus issues' },
    { pid:'pat-19', did:'staff-doc-01', dept:'dept-01', day:-1,  time:'09:00', type:'New Visit',    status:'COMPLETED', token:1, reason:'General check-up' },
    { pid:'pat-20', did:'staff-doc-03', dept:'dept-03', day:-1,  time:'09:30', type:'Follow-up',    status:'COMPLETED', token:2, reason:'Eczema review' },
    // Today
    { pid:'pat-01', did:'staff-doc-01', dept:'dept-01', day:0,   time:'09:00', type:'Follow-up',    status:'COMPLETED',   token:1, reason:'BP follow-up' },
    { pid:'pat-02', did:'staff-doc-02', dept:'dept-02', day:0,   time:'09:30', type:'Follow-up',    status:'IN_PROGRESS', token:1, reason:'Child fever' },
    { pid:'pat-03', did:'staff-doc-01', dept:'dept-01', day:0,   time:'10:00', type:'Follow-up',    status:'CHECKED_IN',  token:2, reason:'Sugar level check' },
    { pid:'pat-04', did:'staff-doc-04', dept:'dept-04', day:0,   time:'10:30', type:'Follow-up',    status:'CHECKED_IN',  token:1, reason:'Knee follow-up' },
    { pid:'pat-05', did:'staff-doc-01', dept:'dept-01', day:0,   time:'11:00', type:'New Visit',    status:'SCHEDULED',   token:3, reason:'Fever and cold' },
    { pid:'pat-06', did:'staff-doc-05', dept:'dept-05', day:0,   time:'11:30', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Throat infection' },
    { pid:'pat-07', did:'staff-doc-01', dept:'dept-01', day:0,   time:'14:00', type:'Follow-up',    status:'SCHEDULED',   token:4, reason:'Medication review' },
    { pid:'pat-23', did:'staff-doc-02', dept:'dept-02', day:0,   time:'14:30', type:'New Visit',    status:'SCHEDULED',   token:2, reason:'Child vaccination' },
    { pid:'pat-11', did:'staff-doc-01', dept:'dept-01', day:0,   time:'15:00', type:'Follow-up',    status:'SCHEDULED',   token:5, reason:'COPD review' },
    { pid:'pat-24', did:'staff-doc-02', dept:'dept-02', day:0,   time:'15:30', type:'New Visit',    status:'SCHEDULED',   token:3, reason:'Childhood immunisation' },
    // Future
    { pid:'pat-08', did:'staff-doc-06', dept:'dept-06', day:1,   time:'09:00', type:'Follow-up',    status:'SCHEDULED',   token:1, reason:'Post-procedure review' },
    { pid:'pat-09', did:'staff-doc-01', dept:'dept-01', day:1,   time:'09:30', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Health check-up' },
    { pid:'pat-10', did:'staff-doc-05', dept:'dept-05', day:1,   time:'10:00', type:'Follow-up',    status:'SCHEDULED',   token:2, reason:'Ear follow-up' },
    { pid:'pat-12', did:'staff-doc-03', dept:'dept-03', day:2,   time:'09:00', type:'Follow-up',    status:'SCHEDULED',   token:1, reason:'Acne follow-up' },
    { pid:'pat-13', did:'staff-doc-01', dept:'dept-01', day:2,   time:'09:30', type:'Follow-up',    status:'SCHEDULED',   token:2, reason:'HbA1c review' },
    { pid:'pat-14', did:'staff-doc-06', dept:'dept-06', day:3,   time:'09:00', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Regular screening' },
    { pid:'pat-15', did:'staff-doc-04', dept:'dept-04', day:3,   time:'09:30', type:'Follow-up',    status:'SCHEDULED',   token:1, reason:'Physiotherapy review' },
    { pid:'pat-16', did:'staff-doc-02', dept:'dept-02', day:4,   time:'09:00', type:'Follow-up',    status:'SCHEDULED',   token:1, reason:'Growth chart review' },
    { pid:'pat-17', did:'staff-doc-01', dept:'dept-01', day:4,   time:'09:30', type:'Follow-up',    status:'SCHEDULED',   token:3, reason:'Annual health check' },
    { pid:'pat-18', did:'staff-doc-01', dept:'dept-01', day:5,   time:'09:00', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Headache evaluation' },
    { pid:'pat-19', did:'staff-doc-03', dept:'dept-03', day:5,   time:'09:30', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Skin allergy' },
    { pid:'pat-20', did:'staff-doc-01', dept:'dept-01', day:6,   time:'09:00', type:'Follow-up',    status:'SCHEDULED',   token:2, reason:'Follow-up consultation' },
    { pid:'pat-21', did:'staff-doc-05', dept:'dept-05', day:6,   time:'09:30', type:'New Visit',    status:'SCHEDULED',   token:1, reason:'Hearing test' },
    { pid:'pat-22', did:'staff-doc-01', dept:'dept-01', day:7,   time:'09:00', type:'New Visit',    status:'SCHEDULED',   token:3, reason:'New patient consultation' },
    { pid:'pat-01', did:'staff-doc-01', dept:'dept-01', day:7,   time:'10:00', type:'Follow-up',    status:'SCHEDULED',   token:4, reason:'Quarterly review' },
  ];

  apptData.forEach((a, i) => {
    appointments.push({
      id: `appt-${String(i+1).padStart(3,'0')}`,
      patientId: a.pid, doctorId: a.did, departmentId: a.dept,
      date: d(a.day), time: a.time, type: a.type, status: a.status,
      reason: a.reason, notes: null, tokenNumber: a.token,
      createdAt: iso(a.day - 1), updatedAt: iso(a.day), _v: 1,
    });
  });

  /* ══════════ CONSULTATIONS (for completed appointments) ══════════ */
  const consultations = [];
  const completedAppts = appointments.filter(a => a.status === 'COMPLETED');
  completedAppts.forEach((a, i) => {
    consultations.push({
      id: `consult-${a.id.split('-')[1]}`,
      appointmentId: a.id, patientId: a.patientId, doctorId: a.doctorId,
      symptoms: a.reason, diagnosis: 'Clinical evaluation performed',
      notes: 'Patient counselled. Follow-up advised as needed.',
      vitalSigns: { bp: '120/80', pulse: 72 + (i % 10), temp: 98.4 + (i % 3)*0.2, spo2: 97 + (i % 3) },
      isCompleted: true,
      createdAt: iso(parseInt(a.date.slice(8,10)) - parseInt(d(0).slice(8,10)), 10), updatedAt: a.updatedAt, _v: 1,
    });
  });

  /* ══════════ MEDICINES (28) ══════════ */
  const medicines = [
    { id:'med-01', name:'Paracetamol 500mg',      genericName:'Paracetamol',       category:'Analgesic',       form:'Tablet',   strength:'500mg',  manufacturer:'Cipla',       unitPrice:150,   batches:[{batchNo:'B2025A01',expiryDate:d(180),quantity:500,receivedDate:d(-60)}],                                                       reorderLevel:100, isActive:true },
    { id:'med-02', name:'Amoxicillin 500mg',       genericName:'Amoxicillin',       category:'Antibiotic',      form:'Capsule',  strength:'500mg',  manufacturer:'Sun Pharma',  unitPrice:800,   batches:[{batchNo:'B2025A02',expiryDate:d(365),quantity:300,receivedDate:d(-45)}],                                                       reorderLevel:50,  isActive:true },
    { id:'med-03', name:'Azithromycin 250mg',      genericName:'Azithromycin',      category:'Antibiotic',      form:'Tablet',   strength:'250mg',  manufacturer:'Zydus',       unitPrice:1200,  batches:[{batchNo:'B2025A03',expiryDate:d(270),quantity:200,receivedDate:d(-30)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-04', name:'Metformin 500mg',         genericName:'Metformin',         category:'Antidiabetic',    form:'Tablet',   strength:'500mg',  manufacturer:'USV',         unitPrice:250,   batches:[{batchNo:'B2025A04',expiryDate:d(300),quantity:400,receivedDate:d(-50)}],                                                       reorderLevel:80,  isActive:true },
    { id:'med-05', name:'Amlodipine 5mg',          genericName:'Amlodipine',        category:'Antihypertensive',form:'Tablet',   strength:'5mg',    manufacturer:'Cipla',       unitPrice:350,   batches:[{batchNo:'B2025A05',expiryDate:d(400),quantity:350,receivedDate:d(-40)}],                                                       reorderLevel:60,  isActive:true },
    { id:'med-06', name:'Omeprazole 20mg',         genericName:'Omeprazole',        category:'Antacid',         form:'Capsule',  strength:'20mg',   manufacturer:'Dr. Reddys',  unitPrice:450,   batches:[{batchNo:'B2025A06',expiryDate:d(250),quantity:280,receivedDate:d(-35)}],                                                       reorderLevel:50,  isActive:true },
    { id:'med-07', name:'Cetirizine 10mg',         genericName:'Cetirizine',        category:'Antihistamine',   form:'Tablet',   strength:'10mg',   manufacturer:'Sun Pharma',  unitPrice:200,   batches:[{batchNo:'B2025A07',expiryDate:d(200),quantity:400,receivedDate:d(-55)}],                                                       reorderLevel:70,  isActive:true },
    { id:'med-08', name:'Pantoprazole 40mg',       genericName:'Pantoprazole',      category:'Antacid',         form:'Tablet',   strength:'40mg',   manufacturer:'Alkem',       unitPrice:600,   batches:[{batchNo:'B2025A08',expiryDate:d(320),quantity:200,receivedDate:d(-25)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-09', name:'Atorvastatin 10mg',       genericName:'Atorvastatin',      category:'Statin',          form:'Tablet',   strength:'10mg',   manufacturer:'Cipla',       unitPrice:500,   batches:[{batchNo:'B2025A09',expiryDate:d(280),quantity:250,receivedDate:d(-30)}],                                                       reorderLevel:50,  isActive:true },
    { id:'med-10', name:'Losartan 50mg',           genericName:'Losartan',          category:'Antihypertensive',form:'Tablet',   strength:'50mg',   manufacturer:'Torrent',     unitPrice:400,   batches:[{batchNo:'B2025A10',expiryDate:d(350),quantity:300,receivedDate:d(-20)}],                                                       reorderLevel:60,  isActive:true },
    { id:'med-11', name:'Metoprolol 25mg',         genericName:'Metoprolol',        category:'Beta-blocker',    form:'Tablet',   strength:'25mg',   manufacturer:'Intas',       unitPrice:300,   batches:[{batchNo:'B2025A11',expiryDate:d(290),quantity:200,receivedDate:d(-40)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-12', name:'Ibuprofen 400mg',         genericName:'Ibuprofen',         category:'NSAID',           form:'Tablet',   strength:'400mg',  manufacturer:'Cipla',       unitPrice:180,   batches:[{batchNo:'B2025A12',expiryDate:d(220),quantity:350,receivedDate:d(-45)}],                                                       reorderLevel:60,  isActive:true },
    { id:'med-13', name:'Levothyroxine 50mcg',     genericName:'Levothyroxine',     category:'Thyroid',         form:'Tablet',   strength:'50mcg',  manufacturer:'Abbott',      unitPrice:280,   batches:[{batchNo:'B2025A13',expiryDate:d(400),quantity:300,receivedDate:d(-25)}],                                                       reorderLevel:50,  isActive:true },
    { id:'med-14', name:'Prednisolone 5mg',        genericName:'Prednisolone',      category:'Corticosteroid',  form:'Tablet',   strength:'5mg',    manufacturer:'Wyeth',       unitPrice:350,   batches:[{batchNo:'B2025A14',expiryDate:d(260),quantity:150,receivedDate:d(-35)}],                                                       reorderLevel:30,  isActive:true },
    { id:'med-15', name:'Salbutamol Inhaler',      genericName:'Salbutamol',        category:'Bronchodilator',  form:'Inhaler',  strength:'100mcg', manufacturer:'Cipla',       unitPrice:15000, batches:[{batchNo:'B2025A15',expiryDate:d(300),quantity:60,receivedDate:d(-20)}],                                                        reorderLevel:15,  isActive:true },
    { id:'med-16', name:'Ranitidine 150mg',        genericName:'Ranitidine',        category:'Antacid',         form:'Tablet',   strength:'150mg',  manufacturer:'Cadila',      unitPrice:220,   batches:[{batchNo:'B2025A16',expiryDate:d(180),quantity:250,receivedDate:d(-50)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-17', name:'Doxycycline 100mg',       genericName:'Doxycycline',       category:'Antibiotic',      form:'Capsule',  strength:'100mg',  manufacturer:'Leeford',     unitPrice:900,   batches:[{batchNo:'B2025A17',expiryDate:d(310),quantity:180,receivedDate:d(-30)}],                                                       reorderLevel:30,  isActive:true },
    { id:'med-18', name:'Montelukast 10mg',        genericName:'Montelukast',       category:'Anti-asthmatic',  form:'Tablet',   strength:'10mg',   manufacturer:'Sun Pharma',  unitPrice:700,   batches:[{batchNo:'B2025A18',expiryDate:d(270),quantity:200,receivedDate:d(-25)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-19', name:'Clindamycin 300mg',       genericName:'Clindamycin',       category:'Antibiotic',      form:'Capsule',  strength:'300mg',  manufacturer:'Alkem',       unitPrice:1500,  batches:[{batchNo:'B2025A19',expiryDate:d(350),quantity:120,receivedDate:d(-15)}],                                                       reorderLevel:25,  isActive:true },
    { id:'med-20', name:'Diclofenac Gel 30g',      genericName:'Diclofenac',        category:'NSAID',           form:'Gel',      strength:'1%',     manufacturer:'Novartis',    unitPrice:12000, batches:[{batchNo:'B2025A20',expiryDate:d(200),quantity:80,receivedDate:d(-40)}],                                                        reorderLevel:20,  isActive:true },
    { id:'med-21', name:'Vitamin D3 60000IU',      genericName:'Cholecalciferol',   category:'Supplement',      form:'Capsule',  strength:'60000IU',manufacturer:'Mankind',     unitPrice:3500,  batches:[{batchNo:'B2025A21',expiryDate:d(500),quantity:400,receivedDate:d(-10)}],                                                       reorderLevel:50,  isActive:true },
    { id:'med-22', name:'Clopidogrel 75mg',        genericName:'Clopidogrel',       category:'Antiplatelet',    form:'Tablet',   strength:'75mg',   manufacturer:'Torrent',     unitPrice:600,   batches:[{batchNo:'B2025A22',expiryDate:d(280),quantity:200,receivedDate:d(-30)}],                                                       reorderLevel:40,  isActive:true },
    { id:'med-23', name:'Fluconazole 150mg',       genericName:'Fluconazole',       category:'Antifungal',      form:'Tablet',   strength:'150mg',  manufacturer:'Glenmark',    unitPrice:1100,  batches:[{batchNo:'B2025A23',expiryDate:d(260),quantity:100,receivedDate:d(-20)}],                                                       reorderLevel:20,  isActive:true },
    { id:'med-24', name:'Calcium + Vit D3',        genericName:'Calcium Carbonate', category:'Supplement',      form:'Tablet',   strength:'500mg',  manufacturer:'Abbott',      unitPrice:400,   batches:[{batchNo:'B2025A24',expiryDate:d(400),quantity:500,receivedDate:d(-15)}],                                                       reorderLevel:80,  isActive:true },
    { id:'med-25', name:'Domperidone 10mg',        genericName:'Domperidone',       category:'Antiemetic',      form:'Tablet',   strength:'10mg',   manufacturer:'Dr. Reddys',  unitPrice:250,   batches:[{batchNo:'B2025A25',expiryDate:d(230),quantity:300,receivedDate:d(-35)}],                                                       reorderLevel:50,  isActive:true },
    // Out-of-stock medicine
    { id:'med-26', name:'Ceftriaxone 1g Inj',      genericName:'Ceftriaxone',       category:'Antibiotic',      form:'Injection',strength:'1g',     manufacturer:'Lupin',       unitPrice:8500,  batches:[{batchNo:'B2025A26',expiryDate:d(180),quantity:0,receivedDate:d(-60)}],                                                         reorderLevel:10,  isActive:true },
    // Expired medicine
    { id:'med-27', name:'Amoxiclav 625mg',         genericName:'Amoxicillin+Clavulanic', category:'Antibiotic', form:'Tablet',   strength:'625mg',  manufacturer:'GSK',         unitPrice:1800,  batches:[{batchNo:'B2024X01',expiryDate:d(-30),quantity:45,receivedDate:d(-180)}],                                                       reorderLevel:20,  isActive:true },
    // Split across two batches (different expiry) for FEFO testing
    { id:'med-28', name:'Metformin XR 1000mg',     genericName:'Metformin',         category:'Antidiabetic',    form:'Tablet',   strength:'1000mg', manufacturer:'USV',         unitPrice:450,   batches:[{batchNo:'B2025F01',expiryDate:d(90),quantity:80,receivedDate:d(-90)},{batchNo:'B2025F02',expiryDate:d(300),quantity:200,receivedDate:d(-15)}], reorderLevel:50, isActive:true },
  ].map(m => ({ ...m, createdAt: iso(-60), updatedAt: NOW, _v: 1 }));

  /* ══════════ PRESCRIPTIONS (~26) ══════════ */
  const prescriptions = [];
  const rxData = [
    { cId:'consult-001', pId:'pat-01', dId:'staff-doc-01', items:[{medicineId:'med-05',name:'Amlodipine 5mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'DISPENSED',   dispensedBy:'staff-pharm-01', day:-14 },
    { cId:'consult-002', pId:'pat-02', dId:'staff-doc-02', items:[{medicineId:'med-01',name:'Paracetamol 500mg',dosage:'5ml syrup',frequency:'TID',duration:'5 days',quantity:1}],     status:'DISPENSED',   dispensedBy:'staff-pharm-01', day:-14 },
    { cId:'consult-003', pId:'pat-03', dId:'staff-doc-01', items:[{medicineId:'med-04',name:'Metformin 500mg',dosage:'1 tablet',frequency:'BD',duration:'30 days',quantity:60}],        status:'DISPENSED',   dispensedBy:'staff-pharm-02', day:-13 },
    { cId:'consult-004', pId:'pat-04', dId:'staff-doc-04', items:[{medicineId:'med-12',name:'Ibuprofen 400mg',dosage:'1 tablet',frequency:'TID',duration:'7 days',quantity:21},{medicineId:'med-20',name:'Diclofenac Gel 30g',dosage:'Apply locally',frequency:'BD',duration:'14 days',quantity:1}], status:'DISPENSED', dispensedBy:'staff-pharm-01', day:-12 },
    { cId:'consult-005', pId:'pat-05', dId:'staff-doc-03', items:[{medicineId:'med-07',name:'Cetirizine 10mg',dosage:'1 tablet',frequency:'Once daily',duration:'10 days',quantity:10},{medicineId:'med-14',name:'Prednisolone 5mg',dosage:'1 tablet',frequency:'BD',duration:'5 days',quantity:10}], status:'DISPENSED', dispensedBy:'staff-pharm-02', day:-11 },
    { cId:'consult-007', pId:'pat-07', dId:'staff-doc-01', items:[{medicineId:'med-10',name:'Losartan 50mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}],   status:'DISPENSED',   dispensedBy:'staff-pharm-01', day:-9  },
    { cId:'consult-008', pId:'pat-08', dId:'staff-doc-06', items:[{medicineId:'med-24',name:'Calcium + Vit D3',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'DISPENSED',  dispensedBy:'staff-pharm-01', day:-8  },
    { cId:'consult-010', pId:'pat-10', dId:'staff-doc-05', items:[{medicineId:'med-02',name:'Amoxicillin 500mg',dosage:'1 capsule',frequency:'TID',duration:'7 days',quantity:21},{medicineId:'med-01',name:'Paracetamol 500mg',dosage:'1 tablet',frequency:'TID',duration:'5 days',quantity:15}], status:'DISPENSED', dispensedBy:'staff-pharm-02', day:-7 },
    { cId:'consult-011', pId:'pat-11', dId:'staff-doc-01', items:[{medicineId:'med-15',name:'Salbutamol Inhaler',dosage:'2 puffs',frequency:'PRN',duration:'30 days',quantity:1},{medicineId:'med-18',name:'Montelukast 10mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'DISPENSED', dispensedBy:'staff-pharm-01', day:-6 },
    { cId:'consult-012', pId:'pat-12', dId:'staff-doc-03', items:[{medicineId:'med-17',name:'Doxycycline 100mg',dosage:'1 capsule',frequency:'BD',duration:'14 days',quantity:28}],     status:'DISPENSED',   dispensedBy:'staff-pharm-02', day:-5  },
    { cId:'consult-013', pId:'pat-13', dId:'staff-doc-01', items:[{medicineId:'med-04',name:'Metformin 500mg',dosage:'1 tablet',frequency:'BD',duration:'30 days',quantity:60},{medicineId:'med-05',name:'Amlodipine 5mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'DISPENSED', dispensedBy:'staff-pharm-01', day:-4 },
    { cId:'consult-014', pId:'pat-14', dId:'staff-doc-06', items:[{medicineId:'med-21',name:'Vitamin D3 60000IU',dosage:'1 capsule',frequency:'Once weekly',duration:'8 weeks',quantity:8}], status:'DISPENSED', dispensedBy:'staff-pharm-02', day:-3 },
    { cId:'consult-015', pId:'pat-15', dId:'staff-doc-04', items:[{medicineId:'med-12',name:'Ibuprofen 400mg',dosage:'1 tablet',frequency:'BD',duration:'10 days',quantity:20}],        status:'DISPENSED',   dispensedBy:'staff-pharm-01', day:-3  },
    { cId:'consult-016', pId:'pat-16', dId:'staff-doc-02', items:[{medicineId:'med-01',name:'Paracetamol 500mg',dosage:'5ml',frequency:'TID',duration:'3 days',quantity:1}],              status:'DISPENSED',   dispensedBy:'staff-pharm-02', day:-2  },
    { cId:'consult-017', pId:'pat-17', dId:'staff-doc-01', items:[{medicineId:'med-05',name:'Amlodipine 5mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30},{medicineId:'med-09',name:'Atorvastatin 10mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'DISPENSED', dispensedBy:'staff-pharm-01', day:-2 },
    { cId:'consult-018', pId:'pat-18', dId:'staff-doc-05', items:[{medicineId:'med-03',name:'Azithromycin 250mg',dosage:'1 tablet',frequency:'Once daily',duration:'3 days',quantity:3},{medicineId:'med-06',name:'Omeprazole 20mg',dosage:'1 capsule',frequency:'Once daily',duration:'5 days',quantity:5}], status:'DISPENSED', dispensedBy:'staff-pharm-02', day:-1 },
    { cId:'consult-019', pId:'pat-19', dId:'staff-doc-01', items:[{medicineId:'med-01',name:'Paracetamol 500mg',dosage:'1 tablet',frequency:'TID',duration:'5 days',quantity:15}],       status:'DISPENSED',   dispensedBy:'staff-pharm-01', day:-1  },
    { cId:'consult-020', pId:'pat-20', dId:'staff-doc-03', items:[{medicineId:'med-07',name:'Cetirizine 10mg',dosage:'1 tablet',frequency:'Once daily',duration:'14 days',quantity:14},{medicineId:'med-14',name:'Prednisolone 5mg',dosage:'1 tablet',frequency:'Once daily',duration:'7 days',quantity:7}], status:'DISPENSED', dispensedBy:'staff-pharm-01', day:-1 },
    // Today - pending
    { cId:'consult-021', pId:'pat-01', dId:'staff-doc-01', items:[{medicineId:'med-05',name:'Amlodipine 5mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30},{medicineId:'med-11',name:'Metoprolol 25mg',dosage:'1 tablet',frequency:'BD',duration:'30 days',quantity:60}], status:'PENDING', dispensedBy:null, day:0 },
    // Partially dispensed
    { cId:'consult-004', pId:'pat-04', dId:'staff-doc-04', items:[{medicineId:'med-24',name:'Calcium + Vit D3',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30},{medicineId:'med-12',name:'Ibuprofen 400mg',dosage:'1 tablet',frequency:'BD',duration:'7 days',quantity:14}], status:'PARTIALLY_DISPENSED', dispensedBy:'staff-pharm-01', day:0 },
    // More pending
    { cId:'consult-002', pId:'pat-02', dId:'staff-doc-02', items:[{medicineId:'med-01',name:'Paracetamol 500mg',dosage:'5ml syrup',frequency:'TID',duration:'3 days',quantity:1}],       status:'PENDING',     dispensedBy:null, day:0 },
    { cId:'consult-003', pId:'pat-03', dId:'staff-doc-01', items:[{medicineId:'med-28',name:'Metformin XR 1000mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'PENDING', dispensedBy:null, day:0 },
    // Cancelled
    { cId:'consult-005', pId:'pat-05', dId:'staff-doc-01', items:[{medicineId:'med-02',name:'Amoxicillin 500mg',dosage:'1 capsule',frequency:'TID',duration:'5 days',quantity:15}],      status:'CANCELLED',   dispensedBy:null, day:-7 },
    // More pending from yesterday/today
    { cId:'consult-011', pId:'pat-11', dId:'staff-doc-01', items:[{medicineId:'med-15',name:'Salbutamol Inhaler',dosage:'2 puffs',frequency:'PRN',duration:'30 days',quantity:1}],        status:'PENDING',     dispensedBy:null, day:0  },
    { cId:'consult-013', pId:'pat-13', dId:'staff-doc-01', items:[{medicineId:'med-04',name:'Metformin 500mg',dosage:'1 tablet',frequency:'BD',duration:'30 days',quantity:60},{medicineId:'med-22',name:'Clopidogrel 75mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}], status:'PENDING', dispensedBy:null, day:0 },
    { cId:'consult-017', pId:'pat-17', dId:'staff-doc-01', items:[{medicineId:'med-10',name:'Losartan 50mg',dosage:'1 tablet',frequency:'Once daily',duration:'30 days',quantity:30}],    status:'PENDING',     dispensedBy:null, day:0  },
  ];

  rxData.forEach((r, i) => {
    prescriptions.push({
      id: `rx-${String(i+1).padStart(3,'0')}`,
      consultationId: r.cId, patientId: r.pId, doctorId: r.dId,
      items: r.items, status: r.status,
      dispensedBy: r.dispensedBy,
      dispensedAt: r.dispensedBy ? iso(r.day, 11) : null,
      notes: null,
      createdAt: iso(r.day, 10), updatedAt: iso(r.day, r.dispensedBy ? 11 : 10), _v: 1,
    });
  });

  /* ══════════ SUPPLIERS (4) ══════════ */
  const suppliers = [
    { id:'sup-01', name:'Kerala Medical Supplies Pvt Ltd', contactPerson:'Sunil Mohan',   phone:'+91-484-2345678', email:'info@keralamedical.in', address:'Industrial Area, Kochi',   typicalMedicines:['med-01','med-02','med-03','med-04','med-05','med-06','med-07'], isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'sup-02', name:'MedPharma Distributors',         contactPerson:'Ravi Shankar',   phone:'+91-471-2567890', email:'orders@medpharma.in',   address:'Technopark Rd, Trivandrum', typicalMedicines:['med-08','med-09','med-10','med-11','med-12','med-13','med-14'], isActive:true, createdAt:iso(-160), updatedAt:NOW, _v:1 },
    { id:'sup-03', name:'Aarogya Healthcare Solutions',    contactPerson:'Prashant Nair',  phone:'+91-495-2789012', email:'sales@aarogya.in',      address:'Mavoor Rd, Kozhikode',      typicalMedicines:['med-15','med-16','med-17','med-18','med-19','med-20','med-21'], isActive:true, createdAt:iso(-140), updatedAt:NOW, _v:1 },
    { id:'sup-04', name:'South India Pharma Corp',        contactPerson:'Jayesh Varghese', phone:'+91-487-2890123', email:'corp@sipharmacorp.in',  address:'Round South, Thrissur',      typicalMedicines:['med-22','med-23','med-24','med-25','med-26','med-27','med-28'], isActive:true, createdAt:iso(-120), updatedAt:NOW, _v:1 },
  ];

  /* ══════════ PURCHASE ORDERS (6) ══════════ */
  const purchaseOrders = [
    { id:'po-001', supplierId:'sup-01', items:[{medicineId:'med-01',name:'Paracetamol 500mg',quantityOrdered:500,unitCost:120,quantityReceived:500},{medicineId:'med-02',name:'Amoxicillin 500mg',quantityOrdered:300,unitCost:650,quantityReceived:300}], status:'RECEIVED',           totalAmount:25500000, orderDate:d(-60), expectedDate:d(-53), receivedDate:d(-55), notes:'Regular monthly order', createdBy:'staff-pharm-01', createdAt:iso(-60), updatedAt:iso(-55), _v:3 },
    { id:'po-002', supplierId:'sup-02', items:[{medicineId:'med-09',name:'Atorvastatin 10mg',quantityOrdered:250,unitCost:400,quantityReceived:250},{medicineId:'med-10',name:'Losartan 50mg',quantityOrdered:300,unitCost:320,quantityReceived:300}],     status:'RECEIVED',           totalAmount:19600000, orderDate:d(-45), expectedDate:d(-38), receivedDate:d(-40), notes:null,                   createdBy:'staff-pharm-01', createdAt:iso(-45), updatedAt:iso(-40), _v:3 },
    { id:'po-003', supplierId:'sup-03', items:[{medicineId:'med-15',name:'Salbutamol Inhaler',quantityOrdered:60,unitCost:12000,quantityReceived:60}],                                                                                        status:'RECEIVED',           totalAmount:72000000, orderDate:d(-30), expectedDate:d(-23), receivedDate:d(-25), notes:'Urgent order',          createdBy:'staff-pharm-02', createdAt:iso(-30), updatedAt:iso(-25), _v:3 },
    { id:'po-004', supplierId:'sup-04', items:[{medicineId:'med-26',name:'Ceftriaxone 1g Inj',quantityOrdered:50,unitCost:7000,quantityReceived:30},{medicineId:'med-24',name:'Calcium + Vit D3',quantityOrdered:500,unitCost:320,quantityReceived:500}],   status:'PARTIALLY_RECEIVED', totalAmount:51000000, orderDate:d(-15), expectedDate:d(-8),  receivedDate:d(-10), notes:'Ceftriaxone partial',   createdBy:'staff-pharm-01', createdAt:iso(-15), updatedAt:iso(-10), _v:2 },
    { id:'po-005', supplierId:'sup-01', items:[{medicineId:'med-03',name:'Azithromycin 250mg',quantityOrdered:200,unitCost:950,quantityReceived:0},{medicineId:'med-07',name:'Cetirizine 10mg',quantityOrdered:400,unitCost:160,quantityReceived:0}],        status:'ORDERED',            totalAmount:25400000, orderDate:d(-5),  expectedDate:d(2),   receivedDate:null,   notes:null,                   createdBy:'staff-pharm-02', createdAt:iso(-5),  updatedAt:iso(-5),  _v:1 },
    { id:'po-006', supplierId:'sup-02', items:[{medicineId:'med-11',name:'Metoprolol 25mg',quantityOrdered:200,unitCost:240,quantityReceived:0}],                                                                                              status:'DRAFT',              totalAmount:4800000,  orderDate:d(0),   expectedDate:null,   receivedDate:null,   notes:'Pending approval',     createdBy:'staff-pharm-01', createdAt:iso(0),   updatedAt:iso(0),   _v:1 },
  ];

  /* ══════════ STOCK LEDGER (sample entries) ══════════ */
  const stockLedger = [
    { id:'sl-001', medicineId:'med-01', batchNo:'B2025A01', type:'PURCHASE',  quantity:500,  referenceId:'po-001', note:'PO received', performedBy:'staff-pharm-01', createdAt:iso(-55), _v:1 },
    { id:'sl-002', medicineId:'med-02', batchNo:'B2025A02', type:'PURCHASE',  quantity:300,  referenceId:'po-001', note:'PO received', performedBy:'staff-pharm-01', createdAt:iso(-55), _v:1 },
    { id:'sl-003', medicineId:'med-01', batchNo:'B2025A01', type:'DISPENSE',  quantity:-15,  referenceId:'rx-002', note:'Dispensed',    performedBy:'staff-pharm-01', createdAt:iso(-14), _v:1 },
    { id:'sl-004', medicineId:'med-05', batchNo:'B2025A05', type:'DISPENSE',  quantity:-30,  referenceId:'rx-001', note:'Dispensed',    performedBy:'staff-pharm-01', createdAt:iso(-14), _v:1 },
    { id:'sl-005', medicineId:'med-04', batchNo:'B2025A04', type:'DISPENSE',  quantity:-60,  referenceId:'rx-003', note:'Dispensed',    performedBy:'staff-pharm-02', createdAt:iso(-13), _v:1 },
  ];

  /* ══════════ LAB CATALOG (12 tests) ══════════ */
  const labCatalog = [
    { id:'test-01', name:'Complete Blood Count (CBC)',    code:'CBC',  category:'Haematology', sampleType:'Blood (EDTA)', parameters:[{name:'Haemoglobin',unit:'g/dL',refMin:12,refMax:17,criticalMin:7,criticalMax:20},{name:'WBC Count',unit:'×10³/µL',refMin:4,refMax:11,criticalMin:2,criticalMax:30},{name:'Platelet Count',unit:'×10³/µL',refMin:150,refMax:400,criticalMin:50,criticalMax:1000},{name:'RBC Count',unit:'×10⁶/µL',refMin:4.2,refMax:5.9,criticalMin:2.5,criticalMax:8}], turnaroundHrs:4, price:35000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-02', name:'Blood Glucose (Fasting)',       code:'FBS',  category:'Biochemistry', sampleType:'Blood (Fluoride)', parameters:[{name:'Fasting Blood Sugar',unit:'mg/dL',refMin:70,refMax:100,criticalMin:40,criticalMax:400}], turnaroundHrs:2, price:15000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-03', name:'HbA1c',                         code:'HBA1C',category:'Biochemistry', sampleType:'Blood (EDTA)', parameters:[{name:'HbA1c',unit:'%',refMin:4,refMax:5.6,criticalMin:null,criticalMax:14}], turnaroundHrs:6, price:45000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-04', name:'Lipid Profile',                  code:'LIPID',category:'Biochemistry', sampleType:'Blood (Plain)', parameters:[{name:'Total Cholesterol',unit:'mg/dL',refMin:0,refMax:200,criticalMin:null,criticalMax:400},{name:'Triglycerides',unit:'mg/dL',refMin:0,refMax:150,criticalMin:null,criticalMax:500},{name:'HDL',unit:'mg/dL',refMin:40,refMax:60,criticalMin:null,criticalMax:null},{name:'LDL',unit:'mg/dL',refMin:0,refMax:100,criticalMin:null,criticalMax:300}], turnaroundHrs:6, price:55000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-05', name:'Thyroid Profile (T3, T4, TSH)',  code:'TFT',  category:'Endocrinology', sampleType:'Blood (Plain)', parameters:[{name:'T3',unit:'ng/dL',refMin:80,refMax:200,criticalMin:null,criticalMax:null},{name:'T4',unit:'µg/dL',refMin:4.5,refMax:12,criticalMin:null,criticalMax:null},{name:'TSH',unit:'mIU/L',refMin:0.4,refMax:4.0,criticalMin:0.1,criticalMax:40}], turnaroundHrs:8, price:65000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-06', name:'Liver Function Test (LFT)',      code:'LFT',  category:'Biochemistry', sampleType:'Blood (Plain)', parameters:[{name:'Total Bilirubin',unit:'mg/dL',refMin:0.1,refMax:1.2,criticalMin:null,criticalMax:15},{name:'SGOT (AST)',unit:'U/L',refMin:0,refMax:40,criticalMin:null,criticalMax:1000},{name:'SGPT (ALT)',unit:'U/L',refMin:0,refMax:40,criticalMin:null,criticalMax:1000},{name:'Alkaline Phosphatase',unit:'U/L',refMin:44,refMax:147,criticalMin:null,criticalMax:null}], turnaroundHrs:6, price:50000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-07', name:'Kidney Function Test (KFT)',     code:'KFT',  category:'Biochemistry', sampleType:'Blood (Plain)', parameters:[{name:'Blood Urea',unit:'mg/dL',refMin:15,refMax:40,criticalMin:null,criticalMax:100},{name:'Serum Creatinine',unit:'mg/dL',refMin:0.6,refMax:1.2,criticalMin:null,criticalMax:10},{name:'Uric Acid',unit:'mg/dL',refMin:3,refMax:7,criticalMin:null,criticalMax:null}], turnaroundHrs:6, price:45000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-08', name:'Urine Routine',                  code:'URINE',category:'Pathology', sampleType:'Urine (Mid-stream)', parameters:[{name:'pH',unit:'',refMin:4.5,refMax:8,criticalMin:null,criticalMax:null},{name:'Protein',unit:'',refMin:null,refMax:null,criticalMin:null,criticalMax:null},{name:'Glucose',unit:'',refMin:null,refMax:null,criticalMin:null,criticalMax:null},{name:'RBC',unit:'/HPF',refMin:0,refMax:2,criticalMin:null,criticalMax:null},{name:'WBC',unit:'/HPF',refMin:0,refMax:5,criticalMin:null,criticalMax:null}], turnaroundHrs:3, price:20000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-09', name:'ESR',                            code:'ESR',  category:'Haematology', sampleType:'Blood (EDTA)', parameters:[{name:'ESR (Westergren)',unit:'mm/hr',refMin:0,refMax:20,criticalMin:null,criticalMax:100}], turnaroundHrs:2, price:10000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-10', name:'Blood Group & Rh Typing',        code:'BG',   category:'Haematology', sampleType:'Blood (EDTA)', parameters:[{name:'Blood Group',unit:'',refMin:null,refMax:null,criticalMin:null,criticalMax:null},{name:'Rh Factor',unit:'',refMin:null,refMax:null,criticalMin:null,criticalMax:null}], turnaroundHrs:1, price:15000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-11', name:'Serum Electrolytes',             code:'ELEC', category:'Biochemistry', sampleType:'Blood (Plain)', parameters:[{name:'Sodium',unit:'mEq/L',refMin:136,refMax:145,criticalMin:120,criticalMax:160},{name:'Potassium',unit:'mEq/L',refMin:3.5,refMax:5.0,criticalMin:2.5,criticalMax:6.5},{name:'Chloride',unit:'mEq/L',refMin:98,refMax:106,criticalMin:80,criticalMax:120}], turnaroundHrs:4, price:40000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
    { id:'test-12', name:'C-Reactive Protein (CRP)',       code:'CRP',  category:'Immunology', sampleType:'Blood (Plain)', parameters:[{name:'CRP',unit:'mg/L',refMin:0,refMax:5,criticalMin:null,criticalMax:200}], turnaroundHrs:4, price:35000, isActive:true, createdAt:iso(-180), updatedAt:NOW, _v:1 },
  ];

  /* ══════════ LAB ORDERS (30) ══════════ */
  const labOrders = [];
  const loData = [
    // Completed
    { pId:'pat-01', dId:'staff-doc-01', tId:'test-01', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-14, results:[{parameter:'Haemoglobin',value:'14.2',unit:'g/dL',flag:'normal'},{parameter:'WBC Count',value:'7.5',unit:'×10³/µL',flag:'normal'},{parameter:'Platelet Count',value:'250',unit:'×10³/µL',flag:'normal'},{parameter:'RBC Count',value:'4.8',unit:'×10⁶/µL',flag:'normal'}], isCritical:false },
    { pId:'pat-03', dId:'staff-doc-01', tId:'test-02', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-13, results:[{parameter:'Fasting Blood Sugar',value:'142',unit:'mg/dL',flag:'high'}],                                                                              isCritical:false },
    { pId:'pat-03', dId:'staff-doc-01', tId:'test-03', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-13, results:[{parameter:'HbA1c',value:'7.8',unit:'%',flag:'high'}],                                                                                                  isCritical:false },
    { pId:'pat-04', dId:'staff-doc-04', tId:'test-09', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-12, results:[{parameter:'ESR (Westergren)',value:'35',unit:'mm/hr',flag:'high'}],                                                                                     isCritical:false },
    { pId:'pat-07', dId:'staff-doc-01', tId:'test-04', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-9,  results:[{parameter:'Total Cholesterol',value:'245',unit:'mg/dL',flag:'high'},{parameter:'Triglycerides',value:'180',unit:'mg/dL',flag:'high'},{parameter:'HDL',value:'38',unit:'mg/dL',flag:'low'},{parameter:'LDL',value:'142',unit:'mg/dL',flag:'high'}], isCritical:false },
    { pId:'pat-11', dId:'staff-doc-01', tId:'test-01', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-6,  results:[{parameter:'Haemoglobin',value:'13.5',unit:'g/dL',flag:'normal'},{parameter:'WBC Count',value:'9.2',unit:'×10³/µL',flag:'normal'},{parameter:'Platelet Count',value:'220',unit:'×10³/µL',flag:'normal'},{parameter:'RBC Count',value:'4.5',unit:'×10⁶/µL',flag:'normal'}], isCritical:false },
    { pId:'pat-13', dId:'staff-doc-01', tId:'test-02', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-4,  results:[{parameter:'Fasting Blood Sugar',value:'158',unit:'mg/dL',flag:'high'}],                                                                              isCritical:false },
    { pId:'pat-13', dId:'staff-doc-01', tId:'test-07', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-4,  results:[{parameter:'Blood Urea',value:'38',unit:'mg/dL',flag:'normal'},{parameter:'Serum Creatinine',value:'1.0',unit:'mg/dL',flag:'normal'},{parameter:'Uric Acid',value:'5.5',unit:'mg/dL',flag:'normal'}], isCritical:false },
    { pId:'pat-17', dId:'staff-doc-01', tId:'test-04', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-2,  results:[{parameter:'Total Cholesterol',value:'210',unit:'mg/dL',flag:'high'},{parameter:'Triglycerides',value:'155',unit:'mg/dL',flag:'high'},{parameter:'HDL',value:'42',unit:'mg/dL',flag:'normal'},{parameter:'LDL',value:'115',unit:'mg/dL',flag:'high'}], isCritical:false },
    { pId:'pat-19', dId:'staff-doc-01', tId:'test-06', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-1,  results:[{parameter:'Total Bilirubin',value:'0.8',unit:'mg/dL',flag:'normal'},{parameter:'SGOT (AST)',value:'28',unit:'U/L',flag:'normal'},{parameter:'SGPT (ALT)',value:'32',unit:'U/L',flag:'normal'},{parameter:'Alkaline Phosphatase',value:'90',unit:'U/L',flag:'normal'}], isCritical:false },
    // Critical results
    { pId:'pat-01', dId:'staff-doc-01', tId:'test-11', status:'COMPLETED', priority:'Urgent', techId:'staff-lab-01', day:-1,  results:[{parameter:'Sodium',value:'128',unit:'mEq/L',flag:'critical_low'},{parameter:'Potassium',value:'5.8',unit:'mEq/L',flag:'critical_high'},{parameter:'Chloride',value:'95',unit:'mEq/L',flag:'low'}], isCritical:true },
    { pId:'pat-13', dId:'staff-doc-01', tId:'test-02', status:'COMPLETED', priority:'Stat', techId:'staff-lab-02', day:0,    results:[{parameter:'Fasting Blood Sugar',value:'320',unit:'mg/dL',flag:'critical_high'}],                                                                         isCritical:true },
    // Today — various states
    { pId:'pat-01', dId:'staff-doc-01', tId:'test-01', status:'ORDERED',           priority:'Routine', techId:null,           day:0, results:null, isCritical:false },
    { pId:'pat-02', dId:'staff-doc-02', tId:'test-01', status:'ORDERED',           priority:'Routine', techId:null,           day:0, results:null, isCritical:false },
    { pId:'pat-03', dId:'staff-doc-01', tId:'test-03', status:'SAMPLE_COLLECTED',  priority:'Routine', techId:'staff-lab-01', day:0, results:null, isCritical:false },
    { pId:'pat-04', dId:'staff-doc-04', tId:'test-09', status:'SAMPLE_COLLECTED',  priority:'Routine', techId:'staff-lab-02', day:0, results:null, isCritical:false },
    { pId:'pat-05', dId:'staff-doc-01', tId:'test-12', status:'PROCESSING',        priority:'Routine', techId:'staff-lab-01', day:0, results:null, isCritical:false },
    { pId:'pat-07', dId:'staff-doc-01', tId:'test-04', status:'PROCESSING',        priority:'Urgent',  techId:'staff-lab-02', day:0, results:null, isCritical:false },
    { pId:'pat-11', dId:'staff-doc-01', tId:'test-01', status:'ORDERED',           priority:'Routine', techId:null,           day:0, results:null, isCritical:false },
    { pId:'pat-08', dId:'staff-doc-06', tId:'test-05', status:'ORDERED',           priority:'Routine', techId:null,           day:0, results:null, isCritical:false },
    // Past
    { pId:'pat-02', dId:'staff-doc-02', tId:'test-10', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-14, results:[{parameter:'Blood Group',value:'A',unit:'',flag:'normal'},{parameter:'Rh Factor',value:'Positive',unit:'',flag:'normal'}], isCritical:false },
    { pId:'pat-06', dId:'staff-doc-01', tId:'test-08', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-10, results:[{parameter:'pH',value:'6.0',unit:'',flag:'normal'},{parameter:'Protein',value:'Nil',unit:'',flag:'normal'},{parameter:'Glucose',value:'Nil',unit:'',flag:'normal'},{parameter:'RBC',value:'1',unit:'/HPF',flag:'normal'},{parameter:'WBC',value:'2',unit:'/HPF',flag:'normal'}], isCritical:false },
    { pId:'pat-10', dId:'staff-doc-05', tId:'test-12', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-7,  results:[{parameter:'CRP',value:'12',unit:'mg/L',flag:'high'}],                                                                                                    isCritical:false },
    { pId:'pat-15', dId:'staff-doc-04', tId:'test-09', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-3,  results:[{parameter:'ESR (Westergren)',value:'42',unit:'mm/hr',flag:'high'}],                                                                                     isCritical:false },
    { pId:'pat-16', dId:'staff-doc-02', tId:'test-01', status:'COMPLETED', priority:'Routine', techId:'staff-lab-01', day:-2,  results:[{parameter:'Haemoglobin',value:'11.8',unit:'g/dL',flag:'normal'},{parameter:'WBC Count',value:'6.2',unit:'×10³/µL',flag:'normal'},{parameter:'Platelet Count',value:'280',unit:'×10³/µL',flag:'normal'},{parameter:'RBC Count',value:'4.3',unit:'×10⁶/µL',flag:'normal'}], isCritical:false },
    { pId:'pat-18', dId:'staff-doc-05', tId:'test-01', status:'COMPLETED', priority:'Routine', techId:'staff-lab-02', day:-1,  results:[{parameter:'Haemoglobin',value:'15.1',unit:'g/dL',flag:'normal'},{parameter:'WBC Count',value:'12.5',unit:'×10³/µL',flag:'high'},{parameter:'Platelet Count',value:'310',unit:'×10³/µL',flag:'normal'},{parameter:'RBC Count',value:'5.2',unit:'×10⁶/µL',flag:'normal'}], isCritical:false },
    // Cancelled
    { pId:'pat-09', dId:'staff-doc-01', tId:'test-06', status:'CANCELLED', priority:'Routine', techId:null, day:-7, results:null, isCritical:false },
    // Future orders
    { pId:'pat-12', dId:'staff-doc-03', tId:'test-08', status:'ORDERED', priority:'Routine', techId:null, day:1, results:null, isCritical:false },
    { pId:'pat-14', dId:'staff-doc-06', tId:'test-05', status:'ORDERED', priority:'Routine', techId:null, day:1, results:null, isCritical:false },
    { pId:'pat-15', dId:'staff-doc-04', tId:'test-07', status:'ORDERED', priority:'Routine', techId:null, day:2, results:null, isCritical:false },
  ];

  loData.forEach((lo, i) => {
    labOrders.push({
      id: `lab-${String(i+1).padStart(3,'0')}`,
      patientId: lo.pId, doctorId: lo.dId, testId: lo.tId,
      status: lo.status, priority: lo.priority,
      results: lo.results, isCritical: lo.isCritical,
      technicianId: lo.techId,
      sampleCollectedAt: ['SAMPLE_COLLECTED','PROCESSING','COMPLETED'].includes(lo.status) ? iso(lo.day,9) : null,
      completedAt: lo.status === 'COMPLETED' ? iso(lo.day, 14) : null,
      notes: lo.isCritical ? 'CRITICAL: Doctor notified immediately' : null,
      createdAt: iso(lo.day, 8), updatedAt: iso(lo.day, lo.status === 'COMPLETED' ? 14 : 8), _v: 1,
    });
  });

  /* ══════════ BILLS ══════════ */
  const bills = [
    { id:'bill-001', patientId:'pat-01', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'CBC',amount:35000,type:'lab'}],             totalAmount:85000,  paidAmount:85000,  status:'PAID',    createdBy:'staff-rec-01', createdAt:iso(-14), updatedAt:iso(-14), _v:1 },
    { id:'bill-002', patientId:'pat-02', items:[{description:'Consultation — Paediatrics',amount:60000,type:'consultation'},{description:'Paracetamol Syrup',amount:15000,type:'pharmacy'}], totalAmount:75000,  paidAmount:75000,  status:'PAID',    createdBy:'staff-rec-01', createdAt:iso(-14), updatedAt:iso(-14), _v:1 },
    { id:'bill-003', patientId:'pat-03', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'FBS + HbA1c',amount:60000,type:'lab'},{description:'Metformin',amount:15000,type:'pharmacy'}], totalAmount:125000, paidAmount:125000, status:'PAID', createdBy:'staff-rec-02', createdAt:iso(-13), updatedAt:iso(-13), _v:1 },
    { id:'bill-004', patientId:'pat-04', items:[{description:'Consultation — Orthopaedics',amount:70000,type:'consultation'},{description:'Ibuprofen + Diclofenac Gel',amount:33600,type:'pharmacy'}], totalAmount:103600, paidAmount:103600, status:'PAID', createdBy:'staff-rec-01', createdAt:iso(-12), updatedAt:iso(-12), _v:1 },
    { id:'bill-005', patientId:'pat-07', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'Lipid Profile',amount:55000,type:'lab'},{description:'Losartan',amount:12000,type:'pharmacy'}], totalAmount:117000, paidAmount:50000,  status:'PARTIAL', createdBy:'staff-rec-01', createdAt:iso(-9), updatedAt:iso(-9), _v:1 },
    { id:'bill-006', patientId:'pat-11', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'CBC',amount:35000,type:'lab'},{description:'Salbutamol + Montelukast',amount:36000,type:'pharmacy'}], totalAmount:121000, paidAmount:121000, status:'PAID', createdBy:'staff-rec-02', createdAt:iso(-6), updatedAt:iso(-6), _v:1 },
    { id:'bill-007', patientId:'pat-13', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'FBS + KFT',amount:60000,type:'lab'},{description:'Metformin + Amlodipine',amount:21000,type:'pharmacy'}], totalAmount:131000, paidAmount:0, status:'UNPAID', createdBy:'staff-rec-01', createdAt:iso(-4), updatedAt:iso(-4), _v:1 },
    { id:'bill-008', patientId:'pat-17', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'Lipid Profile',amount:55000,type:'lab'},{description:'Amlodipine + Atorvastatin',amount:25500,type:'pharmacy'}], totalAmount:130500, paidAmount:70000, status:'PARTIAL', createdBy:'staff-rec-02', createdAt:iso(-2), updatedAt:iso(-2), _v:1 },
    { id:'bill-009', patientId:'pat-01', items:[{description:'Consultation — General Medicine (Follow-up)',amount:30000,type:'consultation'},{description:'Electrolytes',amount:40000,type:'lab'}], totalAmount:70000, paidAmount:0, status:'UNPAID', createdBy:'staff-rec-01', createdAt:iso(0), updatedAt:iso(0), _v:1 },
    { id:'bill-010', patientId:'pat-19', items:[{description:'Consultation — General Medicine',amount:50000,type:'consultation'},{description:'LFT',amount:50000,type:'lab'},{description:'Paracetamol',amount:2250,type:'pharmacy'}], totalAmount:102250, paidAmount:102250, status:'PAID', createdBy:'staff-rec-01', createdAt:iso(-1), updatedAt:iso(-1), _v:1 },
  ];

  /* ══════════ PAYMENTS ══════════ */
  const payments = [
    { id:'pay-001', billId:'bill-001', amount:85000,  method:'UPI',  receivedBy:'staff-rec-01', createdAt:iso(-14), _v:1 },
    { id:'pay-002', billId:'bill-002', amount:75000,  method:'CASH', receivedBy:'staff-rec-01', createdAt:iso(-14), _v:1 },
    { id:'pay-003', billId:'bill-003', amount:125000, method:'CARD', receivedBy:'staff-rec-02', createdAt:iso(-13), _v:1 },
    { id:'pay-004', billId:'bill-004', amount:103600, method:'UPI',  receivedBy:'staff-rec-01', createdAt:iso(-12), _v:1 },
    { id:'pay-005', billId:'bill-005', amount:50000,  method:'CASH', receivedBy:'staff-rec-01', createdAt:iso(-9),  _v:1 },
    { id:'pay-006', billId:'bill-006', amount:121000, method:'CARD', receivedBy:'staff-rec-02', createdAt:iso(-6),  _v:1 },
    { id:'pay-007', billId:'bill-008', amount:70000,  method:'UPI',  receivedBy:'staff-rec-02', createdAt:iso(-2),  _v:1 },
    { id:'pay-008', billId:'bill-010', amount:102250, method:'CASH', receivedBy:'staff-rec-01', createdAt:iso(-1),  _v:1 },
  ];

  /* ══════════ NOTIFICATIONS ══════════ */
  const notifications = [
    { id:'notif-01', type:'LAB_RESULT',   title:'Critical Lab Result',                   message:'Patient Arun Nair (CLN-2025-0001) has critical electrolyte levels. Sodium: 128 mEq/L, Potassium: 5.8 mEq/L.',              targetRole:'DOCTOR',      targetUserId:'user-doc-01', isRead:false, link:null, createdAt:iso(-1,14), _v:1 },
    { id:'notif-02', type:'LAB_RESULT',   title:'Critical Lab Result',                   message:'Patient Prasad Namboodiri (CLN-2025-0013) has critical fasting blood sugar: 320 mg/dL.',                                   targetRole:'DOCTOR',      targetUserId:'user-doc-01', isRead:false, link:null, createdAt:iso(0,14), _v:1 },
    { id:'notif-03', type:'STOCK_ALERT',  title:'Out of Stock: Ceftriaxone 1g Inj',      message:'Ceftriaxone 1g Injection is out of stock. Current quantity: 0. Reorder level: 10.',                                       targetRole:'PHARMACIST',  targetUserId:null,          isRead:false, link:null, createdAt:iso(-2),   _v:1 },
    { id:'notif-04', type:'STOCK_ALERT',  title:'Expired Medication: Amoxiclav 625mg',   message:'Batch B2024X01 of Amoxiclav 625mg expired on ' + d(-30) + '. 45 units need disposal.',                                    targetRole:'PHARMACIST',  targetUserId:null,          isRead:false, link:null, createdAt:iso(-1),   _v:1 },
    { id:'notif-05', type:'PRESCRIPTION', title:'New Prescriptions Pending',             message:'6 prescriptions are pending dispensing in the queue.',                                                                      targetRole:'PHARMACIST',  targetUserId:null,          isRead:false, link:null, createdAt:iso(0,10), _v:1 },
    { id:'notif-06', type:'APPOINTMENT',  title:'Today\'s Appointments',                 message:'You have 5 appointments scheduled for today.',                                                                              targetRole:'DOCTOR',      targetUserId:'user-doc-01', isRead:true,  link:null, createdAt:iso(0,7),  _v:1 },
    { id:'notif-07', type:'SYSTEM',       title:'System Maintenance',                    message:'Scheduled maintenance window: Sunday 2:00 AM – 4:00 AM IST.',                                                               targetRole:null,          targetUserId:null,          isRead:true,  link:null, createdAt:iso(-3),   _v:1 },
    { id:'notif-08', type:'BILLING',      title:'Unpaid Bills Reminder',                 message:'2 bills totalling ₹2,010.00 are unpaid and overdue.',                                                                       targetRole:'RECEPTIONIST',targetUserId:null,          isRead:false, link:null, createdAt:iso(0,8),  _v:1 },
  ];

  /* ══════════ SETTINGS ══════════ */
  const settings = [
    { id:'set-01', key:'clinic.name',        value:'"Clinova Healthcare"',   updatedAt:NOW, _v:1 },
    { id:'set-02', key:'clinic.phone',       value:'"+91-484-2345678"',     updatedAt:NOW, _v:1 },
    { id:'set-03', key:'clinic.address',     value:'"MG Road, Ernakulam, Kochi - 682011, Kerala"', updatedAt:NOW, _v:1 },
    { id:'set-04', key:'clinic.email',       value:'"info@clinova.in"',     updatedAt:NOW, _v:1 },
    { id:'set-05', key:'appointment.slotDuration', value:'30',              updatedAt:NOW, _v:1 },
    { id:'set-06', key:'appointment.startTime',    value:'"09:00"',         updatedAt:NOW, _v:1 },
    { id:'set-07', key:'appointment.endTime',      value:'"17:00"',         updatedAt:NOW, _v:1 },
    { id:'set-08', key:'billing.registrationFee',  value:'20000',           updatedAt:NOW, _v:1 }, // paise (₹200) — new patient registration fee
  ];

  /* ══════════ WRITE ALL ══════════ */
  db.clearAll();
  db.replaceAll('departments',    departments);
  db.replaceAll('staff',          staff);
  db.replaceAll('users',          users);
  db.replaceAll('patients',       patients);
  db.replaceAll('appointments',   appointments);
  db.replaceAll('consultations',  consultations);
  db.replaceAll('prescriptions',  prescriptions);
  db.replaceAll('medicines',      medicines);
  db.replaceAll('suppliers',      suppliers);
  db.replaceAll('purchaseOrders', purchaseOrders);
  db.replaceAll('stockLedger',    stockLedger);
  db.replaceAll('labCatalog',     labCatalog);
  db.replaceAll('labOrders',      labOrders);
  db.replaceAll('bills',          bills);
  db.replaceAll('payments',       payments);
  db.replaceAll('notifications',  notifications);
  db.replaceAll('auditLog',       []);
  db.replaceAll('settings',       settings);
  localStorage.setItem('clinova.v1.seedVersion', '1.1');
}

/**
 * Check if seed data exists and matches the current version.
 */
export function isSeeded() {
  try {
    const version = localStorage.getItem('clinova.v1.seedVersion');
    if (version !== '1.1') return false;
    
    const users = JSON.parse(localStorage.getItem('clinova.v1.users') || '[]');
    return users.length > 0;
  } catch { return false; }
}
