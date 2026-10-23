/**
 * Clinova Healthcare — Database Layer
 *
 * localStorage-backed data store with:
 *  - One key per collection (clinova.v1.*)
 *  - Always reads fresh from storage before any write
 *  - All-or-nothing transaction wrapper
 *  - Simple version-conflict detection (_v field)
 *  - Typed errors with friendly messages
 */

import { COLLECTIONS, SCHEMAS } from './schema.js';

/* ── Typed Errors ── */
export class DbError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends DbError {
  constructor(collection, id) {
    super(`Record not found in ${collection} (id: ${id})`, 'NOT_FOUND', { collection, id });
    this.name = 'NotFoundError';
  }
}

export class VersionConflictError extends DbError {
  constructor(collection, id) {
    super(
      `Version conflict: the record in ${collection} (id: ${id}) was modified by another tab or operation. Please refresh and try again.`,
      'VERSION_CONFLICT',
      { collection, id }
    );
    this.name = 'VersionConflictError';
  }
}

export class ValidationError extends DbError {
  constructor(collection, errors) {
    super(`Validation failed for ${collection}: ${errors.join(', ')}`, 'VALIDATION', { collection, errors });
    this.name = 'ValidationError';
  }
}

/* ── Helpers ── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

/* ── Core Read/Write (always fresh from localStorage) ── */
function readCollection(name) {
  const key = COLLECTIONS[name];
  if (!key) throw new DbError(`Unknown collection: ${name}`, 'UNKNOWN_COLLECTION');
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCollection(name, data) {
  const key = COLLECTIONS[name];
  if (!key) throw new DbError(`Unknown collection: ${name}`, 'UNKNOWN_COLLECTION');
  localStorage.setItem(key, JSON.stringify(data));
}

/* ── Validation ── */
function validate(collection, record) {
  const schema = SCHEMAS[collection];
  if (!schema) return; // no schema = skip validation
  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const val = record[field];
    if (rules.required && (val === undefined || val === null || val === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    if (val !== undefined && val !== null && rules.type) {
      if (rules.type === 'object') {
        if (typeof val !== 'object') errors.push(`${field} must be an object/array`);
      } else if (typeof val !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }
    }
    if (val && rules.enum && !rules.enum.includes(val)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
  }
  if (errors.length) throw new ValidationError(collection, errors);
}

/* ── Public API ── */
export const db = {
  generateId,
  /**
   * Get all records from a collection.
   */
  getAll(collection) {
    return readCollection(collection);
  },

  /**
   * Get a single record by id.
   */
  getById(collection, id) {
    const data = readCollection(collection);
    const record = data.find(r => r.id === id);
    if (!record) throw new NotFoundError(collection, id);
    return record;
  },

  /**
   * Find records matching a predicate.
   */
  find(collection, predicate) {
    return readCollection(collection).filter(predicate);
  },

  /**
   * Find one record matching a predicate, or null.
   */
  findOne(collection, predicate) {
    return readCollection(collection).find(predicate) || null;
  },

  /**
   * Insert a new record. Auto-assigns id, createdAt, updatedAt, _v if missing.
   */
  insert(collection, record) {
    const now = nowISO();
    const doc = {
      id: generateId(),
      ...record,
      createdAt: record.createdAt || now,
      updatedAt: record.updatedAt || now,
      _v: 1,
    };
    validate(collection, doc);
    // Read fresh before write
    const data = readCollection(collection);
    data.push(doc);
    writeCollection(collection, data);
    return doc;
  },

  /**
   * Update a record. Uses version-conflict detection.
   * `changes` is a partial object merged onto the existing record.
   */
  update(collection, id, changes) {
    // Read fresh
    const data = readCollection(collection);
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) throw new NotFoundError(collection, id);

    const existing = data[idx];
    // Version conflict check
    if (changes._v !== undefined && changes._v !== existing._v) {
      throw new VersionConflictError(collection, id);
    }

    const updated = {
      ...existing,
      ...changes,
      id: existing.id, // prevent id change
      updatedAt: nowISO(),
      _v: existing._v + 1,
    };
    validate(collection, updated);
    data[idx] = updated;
    writeCollection(collection, data);
    return updated;
  },

  /**
   * Delete a record by id.
   */
  delete(collection, id) {
    const data = readCollection(collection);
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) throw new NotFoundError(collection, id);
    const deleted = data.splice(idx, 1)[0];
    writeCollection(collection, data);
    return deleted;
  },

  /**
   * Replace an entire collection (used by seed).
   */
  replaceAll(collection, records) {
    writeCollection(collection, records);
  },

  /**
   * Clear a single collection.
   */
  clear(collection) {
    writeCollection(collection, []);
  },

  /**
   * Clear all Clinova collections.
   */
  clearAll() {
    for (const key of Object.values(COLLECTIONS)) {
      localStorage.removeItem(key);
    }
  },

  /**
   * All-or-nothing transaction.
   *
   * Takes a callback that receives a `tx` object with the same API as `db`.
   * All writes are buffered; if the callback throws, nothing is persisted.
   *
   * Usage:
   *   db.transaction(tx => {
   *     tx.insert('patients', { ... });
   *     tx.update('appointments', id, { status: 'CANCELLED' });
   *   });
   */
  transaction(callback) {
    // Snapshot current state of all touched collections
    const snapshots = {};
    const pendingWrites = {};

    function ensureSnapshot(collection) {
      if (!snapshots[collection]) {
        snapshots[collection] = readCollection(collection);
        pendingWrites[collection] = [...snapshots[collection]];
      }
    }

    const tx = {
      getAll(collection) {
        ensureSnapshot(collection);
        return [...pendingWrites[collection]];
      },
      getById(collection, id) {
        ensureSnapshot(collection);
        const r = pendingWrites[collection].find(r => r.id === id);
        if (!r) throw new NotFoundError(collection, id);
        return r;
      },
      find(collection, predicate) {
        ensureSnapshot(collection);
        return pendingWrites[collection].filter(predicate);
      },
      findOne(collection, predicate) {
        ensureSnapshot(collection);
        return pendingWrites[collection].find(predicate) || null;
      },
      insert(collection, record) {
        ensureSnapshot(collection);
        const now = nowISO();
        const doc = {
          id: generateId(),
          ...record,
          createdAt: record.createdAt || now,
          updatedAt: record.updatedAt || now,
          _v: 1,
        };
        validate(collection, doc);
        pendingWrites[collection].push(doc);
        return doc;
      },
      update(collection, id, changes) {
        ensureSnapshot(collection);
        const data = pendingWrites[collection];
        const idx = data.findIndex(r => r.id === id);
        if (idx === -1) throw new NotFoundError(collection, id);
        const existing = data[idx];
        if (changes._v !== undefined && changes._v !== existing._v) {
          throw new VersionConflictError(collection, id);
        }
        const updated = {
          ...existing,
          ...changes,
          id: existing.id,
          updatedAt: nowISO(),
          _v: existing._v + 1,
        };
        validate(collection, updated);
        data[idx] = updated;
        return updated;
      },
      delete(collection, id) {
        ensureSnapshot(collection);
        const data = pendingWrites[collection];
        const idx = data.findIndex(r => r.id === id);
        if (idx === -1) throw new NotFoundError(collection, id);
        return data.splice(idx, 1)[0];
      },
    };

    let result;
    try {
      result = callback(tx);
    } catch (err) {
      // Rollback: don't write anything
      throw err;
    }

    // Commit: write all touched collections
    for (const [collection, data] of Object.entries(pendingWrites)) {
      writeCollection(collection, data);
    }
    return result;
  },
};

/* ── Audit helper ── */
export function auditLog(action, collection, documentId, userId, before, after) {
  db.insert('auditLog', {
    action,
    collection,
    documentId,
    userId,
    before: before || null,
    after: after || null,
  });
}
