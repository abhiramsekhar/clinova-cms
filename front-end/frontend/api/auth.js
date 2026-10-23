/**
 * Clinova Healthcare — Authentication API
 *
 * Demo-grade password hashing using Web Crypto API (PBKDF2 with SHA-256).
 * ⚠ NOT production-grade: in a real system, auth would be server-side with
 *   bcrypt/argon2 and HTTP-only session cookies. This is a frontend demo.
 *
 * Features:
 *  - Salted PBKDF2 hash
 *  - 5 failed attempts locks the account for 5 minutes
 *  - Inactive accounts are blocked
 *  - Login creates a session via session.js
 */

import { db, DbError } from '../data/db.js';
import { session } from '../core/session.js';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/* ── Crypto helpers ── */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Public API ── */
export const auth = {
  /**
   * Hash a password with a new salt (used by seed).
   * Returns { hash, salt }.
   */
  async hashPassword(password) {
    const salt = generateSalt();
    const hash = await deriveKey(password, salt);
    return { hash, salt };
  },

  /**
   * Authenticate a user.
   * Returns { user, staff } on success.
   * Throws DbError with friendly message on failure.
   */
  async login(username, password) {
    const user = db.findOne('users', u => u.username === username);

    if (!user) {
      throw new DbError('Invalid username or password.', 'AUTH_FAILED');
    }

    // Check if account is inactive
    if (!user.isActive) {
      throw new DbError(
        'This account has been deactivated. Please contact an administrator.',
        'ACCOUNT_INACTIVE'
      );
    }

    // Check if locked
    if (user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil).getTime();
      if (Date.now() < lockExpiry) {
        const minutesLeft = Math.ceil((lockExpiry - Date.now()) / 60000);
        throw new DbError(
          `Account is locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
          'ACCOUNT_LOCKED'
        );
      }
      // Lock expired — reset
      db.update('users', user.id, { failedAttempts: 0, lockedUntil: null, _v: user._v });
      user.failedAttempts = 0;
      user.lockedUntil = null;
    }

    // Verify password
    const hash = await deriveKey(password, user.salt);
    if (hash !== user.passwordHash) {
      const attempts = (user.failedAttempts || 0) + 1;
      const changes = { failedAttempts: attempts, _v: user._v + (user.lockedUntil === null ? 0 : 1) };

      // Re-read to get correct _v after potential lock reset above
      const freshUser = db.getById('users', user.id);

      if (attempts >= MAX_ATTEMPTS) {
        db.update('users', user.id, {
          failedAttempts: attempts,
          lockedUntil: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
          _v: freshUser._v,
        });
        throw new DbError(
          'Account locked for 5 minutes due to too many failed attempts.',
          'ACCOUNT_LOCKED'
        );
      }

      db.update('users', user.id, { failedAttempts: attempts, _v: freshUser._v });
      const remaining = MAX_ATTEMPTS - attempts;
      throw new DbError(
        `Invalid username or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        'AUTH_FAILED'
      );
    }

    // Success — reset failed attempts, record login
    const freshUser = db.getById('users', user.id);
    db.update('users', user.id, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date().toISOString(),
      _v: freshUser._v,
    });

    // Get staff record
    const staff = db.getById('staff', user.staffId);

    // Create session
    session.create({
      userId: user.id,
      username: user.username,
      role: user.role,
      staffId: user.staffId,
      staffName: staff.name,
      avatarUrl: staff.avatarUrl || null,
    });

    return { user, staff };
  },

  /**
   * Log out the current user.
   */
  logout() {
    session.destroy();
  },
};
