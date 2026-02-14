/**
 * @fileoverview Database encryption key management using Electron's safeStorage
 * API. Keys are 256-bit random values encrypted by the OS keychain (macOS
 * Keychain / Windows DPAPI / Linux libsecret) and stored as `db-key.enc` in
 * the app's userData directory. All operations are synchronous.
 */

import { app, safeStorage } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/** Filename for the encrypted key file in `userData`. */
const KEY_FILENAME = 'db-key.enc';

/** Resolves the full path to the encrypted key file. */
function keyFilePath(): string {
  return path.join(app.getPath('userData'), KEY_FILENAME);
}

/** Returns `true` if the OS keychain is available for encrypting/decrypting strings. */
export function isKeychainAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Returns `true` if an encrypted key file exists on disk. */
export function hasStoredKey(): boolean {
  return fs.existsSync(keyFilePath());
}

/**
 * Generates a 256-bit random key, encrypts it with the OS keychain, and writes
 * it to `userData/db-key.enc` with owner-only permissions (`0o600`).
 *
 * @returns The hex-encoded key string for immediate use.
 */
export function generateAndStoreKey(): string {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const encrypted = safeStorage.encryptString(hexKey);
  fs.writeFileSync(keyFilePath(), encrypted, { mode: 0o600 });
  return hexKey;
}

/**
 * Reads the encrypted key file and decrypts it using the OS keychain.
 *
 * @returns The hex-encoded key string.
 * @throws If the key file is missing or the keychain cannot decrypt it.
 */
export function loadStoredKey(): string {
  const encrypted = fs.readFileSync(keyFilePath());
  return safeStorage.decryptString(encrypted);
}

/**
 * Primary entry point: loads an existing key or generates a new one.
 *
 * @returns The hex-encoded 256-bit database encryption key.
 */
export function resolveKey(): string {
  if (hasStoredKey()) {
    return loadStoredKey();
  }
  return generateAndStoreKey();
}
