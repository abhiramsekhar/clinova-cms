/**
 * Clinova Healthcare — Collection Schemas
 * Defines shape, required fields, and validation for each localStorage collection.
 */

export const COLLECTIONS = {
  users:           'clinova.v1.users',
  staff:           'clinova.v1.staff',
  departments:     'clinova.v1.departments',
  patients:        'clinova.v1.patients',
  appointments:    'clinova.v1.appointments',
  consultations:   'clinova.v1.consultations',
  prescriptions:   'clinova.v1.prescriptions',
  medicines:       'clinova.v1.medicines',
  suppliers:       'clinova.v1.suppliers',
  purchaseOrders:  'clinova.v1.purchaseOrders',
  stockLedger:     'clinova.v1.stockLedger',
  labCatalog:      'clinova.v1.labCatalog',
  labOrders:       'clinova.v1.labOrders',
  bills:           'clinova.v1.bills',
  payments:        'clinova.v1.payments',
  notifications:   'clinova.v1.notifications',
  auditLog:        'clinova.v1.auditLog',
  settings:        'clinova.v1.settings',
};

/* Roles used across the system */
export const ROLES = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECH'];

/* Appointment statuses */
export const APPOINTMENT_STATUS = [
  'SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
];

/* Prescription statuses */
export const PRESCRIPTION_STATUS = [
  'PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED'
];

/* Lab order statuses */
export const LAB_ORDER_STATUS = [
  'ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED'
];

/* Purchase order statuses */
export const PURCHASE_ORDER_STATUS = [
  'DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'
];

/* Bill statuses */
export const BILL_STATUS = ['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'];

/* Stock ledger entry types */
export const STOCK_ENTRY_TYPE = ['PURCHASE', 'DISPENSE', 'ADJUSTMENT', 'RETURN', 'EXPIRED'];

/* Notification types */
export const NOTIFICATION_TYPE = [
  'APPOINTMENT', 'LAB_RESULT', 'STOCK_ALERT', 'PRESCRIPTION', 'SYSTEM', 'BILLING',
  'LAB_ORDER', 'CRITICAL_RESULT', 'RX_REJECTED'
];

/**
 * Schema definitions: { field: { required, type, validate? } }
 * These are used by db.validate() for insert/update sanity checks.
 */
export const SCHEMAS = {
  users: {
    id:            { required: true,  type: 'string'  },
    username:      { required: true,  type: 'string'  },
    passwordHash:  { required: true,  type: 'string'  },
    salt:          { required: true,  type: 'string'  },
    role:          { required: true,  type: 'string', enum: ROLES },
    staffId:       { required: true,  type: 'string'  },
    isActive:      { required: true,  type: 'boolean' },
    failedAttempts:{ required: false, type: 'number'  },
    lockedUntil:   { required: false, type: 'string'  },
    lastLogin:     { required: false, type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  staff: {
    id:            { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    designation:   { required: true,  type: 'string'  },
    departmentId:  { required: false, type: 'string'  },
    role:          { required: true,  type: 'string', enum: ROLES },
    phone:         { required: true,  type: 'string'  },
    email:         { required: false, type: 'string'  },
    avatarUrl:     { required: false, type: 'string'  },
    consultationFee: { required: false, type: 'number' }, // per-doctor fee in paise (optional; overrides department fee)
    isActive:      { required: true,  type: 'boolean' },
    joinedAt:      { required: true,  type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  departments: {
    id:            { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    code:          { required: true,  type: 'string'  },
    headDoctorId:  { required: false, type: 'string'  },
    defaultFee:    { required: false, type: 'number'  }, // consultation fee in paise (optional)
    isActive:      { required: true,  type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  patients: {
    id:            { required: true,  type: 'string'  },
    mrn:           { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    dateOfBirth:   { required: true,  type: 'string'  },
    gender:        { required: true,  type: 'string'  },
    phone:         { required: true,  type: 'string'  },
    email:         { required: false, type: 'string'  },
    address:       { required: false, type: 'string'  },
    bloodGroup:    { required: false, type: 'string'  },
    allergies:     { required: false, type: 'object'  }, // array
    guardianName:  { required: false, type: 'string'  },
    guardianPhone: { required: false, type: 'string'  },
    chronicConditions: { required: false, type: 'object' }, // array
    isActive:      { required: true,  type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  appointments: {
    id:            { required: true,  type: 'string'  },
    patientId:     { required: true,  type: 'string'  },
    doctorId:      { required: true,  type: 'string'  },
    departmentId:  { required: true,  type: 'string'  },
    date:          { required: true,  type: 'string'  },
    time:          { required: true,  type: 'string'  },
    type:          { required: true,  type: 'string'  },
    status:        { required: true,  type: 'string', enum: APPOINTMENT_STATUS },
    reason:        { required: false, type: 'string'  },
    notes:         { required: false, type: 'string'  },
    tokenNumber:   { required: false, type: 'number'  },
    mode:          { required: false, type: 'string', enum: ['WALK_IN', 'PRIOR'] }, // how it was booked
    slotIndex:     { required: false, type: 'number'  }, // 0 = first slot of the day
    billId:        { required: false, type: 'string'  }, // consultation bill
    checkedInAt:   { required: false, type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  consultations: {
    id:            { required: true,  type: 'string'  },
    appointmentId: { required: true,  type: 'string'  },
    patientId:     { required: true,  type: 'string'  },
    doctorId:      { required: true,  type: 'string'  },
    symptoms:      { required: false, type: 'string'  },
    diagnosis:     { required: false, type: 'string'  },
    notes:         { required: false, type: 'string'  },
    vitalSigns:    { required: false, type: 'object'  },
    isCompleted:   { required: false, type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  prescriptions: {
    id:            { required: true,  type: 'string'  },
    consultationId:{ required: false, type: 'string'  },
    patientId:     { required: true,  type: 'string'  },
    doctorId:      { required: true,  type: 'string'  },
    items:         { required: true,  type: 'object'  }, // array of { medicineId, name, dosage, frequency, duration, quantity }
    status:        { required: true,  type: 'string', enum: PRESCRIPTION_STATUS },
    dispensedBy:   { required: false, type: 'string'  },
    dispensedAt:   { required: false, type: 'string'  },
    notes:         { required: false, type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  medicines: {
    id:            { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    genericName:   { required: true,  type: 'string'  },
    category:      { required: true,  type: 'string'  },
    form:          { required: true,  type: 'string'  },
    strength:      { required: true,  type: 'string'  },
    manufacturer:  { required: false, type: 'string'  },
    unitPrice:     { required: true,  type: 'number'  }, // paise
    batches:       { required: true,  type: 'object'  }, // array of { batchNo, expiryDate, quantity, receivedDate }
    reorderLevel:  { required: true,  type: 'number'  },
    isActive:      { required: true,  type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  suppliers: {
    id:            { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    contactPerson: { required: true,  type: 'string'  },
    phone:         { required: true,  type: 'string'  },
    email:         { required: false, type: 'string'  },
    address:       { required: false, type: 'string'  },
    typicalMedicines: { required: false, type: 'object' }, // array of medicine IDs
    isActive:      { required: true,  type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  purchaseOrders: {
    id:            { required: true,  type: 'string'  },
    supplierId:    { required: true,  type: 'string'  },
    items:         { required: true,  type: 'object'  }, // array of { medicineId, name, quantity, unitCost, receivedQty }
    status:        { required: true,  type: 'string', enum: PURCHASE_ORDER_STATUS },
    totalAmount:   { required: true,  type: 'number'  }, // paise
    orderDate:     { required: true,  type: 'string'  },
    expectedDate:  { required: false, type: 'string'  },
    receivedDate:  { required: false, type: 'string'  },
    notes:         { required: false, type: 'string'  },
    createdBy:     { required: true,  type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  stockLedger: {
    id:            { required: true,  type: 'string'  },
    medicineId:    { required: true,  type: 'string'  },
    batchNo:       { required: true,  type: 'string'  },
    type:          { required: true,  type: 'string', enum: STOCK_ENTRY_TYPE },
    quantity:      { required: true,  type: 'number'  }, // positive = in, negative = out
    referenceId:   { required: false, type: 'string'  }, // PO id, prescription id, etc.
    note:          { required: false, type: 'string'  },
    performedBy:   { required: true,  type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  labCatalog: {
    id:            { required: true,  type: 'string'  },
    name:          { required: true,  type: 'string'  },
    code:          { required: true,  type: 'string'  },
    category:      { required: true,  type: 'string'  },
    sampleType:    { required: true,  type: 'string'  },
    parameters:    { required: true,  type: 'object'  }, // array of { name, unit, refMin, refMax, criticalMin, criticalMax }
    turnaroundHrs: { required: true,  type: 'number'  },
    price:         { required: true,  type: 'number'  }, // paise
    isActive:      { required: true,  type: 'boolean' },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  labOrders: {
    id:            { required: true,  type: 'string'  },
    patientId:     { required: true,  type: 'string'  },
    doctorId:      { required: true,  type: 'string'  },
    testId:        { required: true,  type: 'string'  },
    status:        { required: true,  type: 'string', enum: LAB_ORDER_STATUS },
    priority:      { required: true,  type: 'string'  },
    results:       { required: false, type: 'object'  }, // array of { parameter, value, unit, flag }
    isCritical:    { required: false, type: 'boolean' },
    technicianId:  { required: false, type: 'string'  },
    sampleCollectedAt: { required: false, type: 'string' },
    completedAt:   { required: false, type: 'string'  },
    notes:         { required: false, type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  bills: {
    id:            { required: true,  type: 'string'  },
    patientId:     { required: true,  type: 'string'  },
    items:         { required: true,  type: 'object'  }, // array of { description, amount, type }
    totalAmount:   { required: true,  type: 'number'  }, // paise
    paidAmount:    { required: true,  type: 'number'  }, // paise
    status:        { required: true,  type: 'string', enum: BILL_STATUS },
    createdBy:     { required: true,  type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  payments: {
    id:            { required: true,  type: 'string'  },
    billId:        { required: true,  type: 'string'  },
    amount:        { required: true,  type: 'number'  }, // paise
    method:        { required: true,  type: 'string'  }, // CASH, CARD, UPI
    receivedBy:    { required: true,  type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  notifications: {
    id:            { required: true,  type: 'string'  },
    type:          { required: true,  type: 'string', enum: NOTIFICATION_TYPE },
    title:         { required: true,  type: 'string'  },
    message:       { required: true,  type: 'string'  },
    targetRole:    { required: false, type: 'string'  },
    targetUserId:  { required: false, type: 'string'  },
    isRead:        { required: true,  type: 'boolean' },
    link:          { required: false, type: 'string'  },
    createdAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  auditLog: {
    id:            { required: true,  type: 'string'  },
    action:        { required: true,  type: 'string'  },
    collection:    { required: true,  type: 'string'  },
    documentId:    { required: true,  type: 'string'  },
    userId:        { required: true,  type: 'string'  },
    before:        { required: false, type: 'object'  },
    after:         { required: false, type: 'object'  },
    createdAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },

  settings: {
    id:            { required: true,  type: 'string'  },
    key:           { required: true,  type: 'string'  },
    value:         { required: true,  type: 'string'  },  // JSON-encoded
    updatedAt:     { required: true,  type: 'string'  },
    _v:            { required: true,  type: 'number'  },
  },
};
