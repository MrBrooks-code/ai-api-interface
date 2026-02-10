/**
 * @fileoverview Local SQLite persistence layer. Manages conversations, messages,
 * SSO configurations, and application settings. All queries use parameterized
 * statements to prevent SQL injection. The database uses WAL journal mode for
 * concurrency and foreign key constraints for referential integrity.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import type { Conversation, ChatMessage, ContentBlock, SsoConfiguration } from '../shared/types';

let db: Database.Database;

/** Opens the SQLite database and creates tables if they don't exist. */
export function initStore() {
  const dbPath = path.join(app.getPath('userData'), 'bedrock-chat.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('secure_delete = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      stop_reason TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, timestamp);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sso_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sso_start_url TEXT NOT NULL,
      sso_region TEXT NOT NULL,
      account_id TEXT,
      account_name TEXT,
      role_name TEXT,
      bedrock_region TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/** Returns all conversations, most recently updated first. */
export function listConversations(): Conversation[] {
  const rows = db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
    .all() as Array<{ id: string; title: string; created_at: number; updated_at: number }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Returns a single conversation by ID, or `null` if not found. */
export function getConversation(id: string): Conversation | null {
  const row = db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?')
    .get(id) as { id: string; title: string; created_at: number; updated_at: number } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts a new conversation and returns the created record. */
export function createConversation(id: string, title: string): Conversation {
  const now = Date.now();
  db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, title, now, now);

  return { id, title, createdAt: now, updatedAt: now };
}

/** Deletes a conversation and its messages (via foreign key cascade). */
export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

/** Updates a conversation's title and bumps its `updated_at` timestamp. */
export function updateConversationTitle(id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id);
}

/**
 * Persists a chat message. `Uint8Array` content (images, documents) is
 * serialized to base64 for JSON storage. Also bumps the parent conversation's
 * `updated_at` timestamp.
 */
export function saveMessage(message: ChatMessage): void {
  const contentJson = JSON.stringify(message.content, (_key, value) => {
    // Convert Uint8Array to base64 for storage
    if (value instanceof Uint8Array) {
      return { __type: 'Uint8Array', data: Buffer.from(value).toString('base64') };
    }
    return value;
  });

  db.prepare(
    'INSERT OR REPLACE INTO messages (id, conversation_id, role, content, timestamp, stop_reason) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(message.id, message.conversationId, message.role, contentJson, message.timestamp, message.stopReason ?? null);

  // Update conversation timestamp
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
    .run(message.timestamp, message.conversationId);
}

/**
 * Searches conversations by title or message text content. Returns conversations
 * where the query matches the title or any text block inside a message.
 */
export function searchConversations(query: string): Conversation[] {
  const pattern = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT DISTINCT c.id, c.title, c.created_at, c.updated_at
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.title LIKE ? OR m.content LIKE ?
       ORDER BY c.updated_at DESC`
    )
    .all(pattern, pattern) as Array<{ id: string; title: string; created_at: number; updated_at: number }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Returns all messages for a conversation in chronological order. */
export function getMessages(conversationId: string): ChatMessage[] {
  const rows = db
    .prepare('SELECT id, conversation_id, role, content, timestamp, stop_reason FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC')
    .all(conversationId) as Array<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      timestamp: number;
      stop_reason: string | null;
    }>;

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as 'user' | 'assistant',
    content: JSON.parse(r.content, (_key, value) => {
      if (value && typeof value === 'object' && value.__type === 'Uint8Array') {
        return new Uint8Array(Buffer.from(value.data, 'base64'));
      }
      return value;
    }) as ContentBlock[],
    timestamp: r.timestamp,
    stopReason: r.stop_reason ?? undefined,
  }));
}

// --- SSO Configs ---

/** Raw SQLite row shape for the `sso_configs` table. */
interface SsoConfigRow {
  id: string;
  name: string;
  sso_start_url: string;
  sso_region: string;
  account_id: string | null;
  account_name: string | null;
  role_name: string | null;
  bedrock_region: string;
  created_at: number;
  updated_at: number;
}

/** Maps a database row to the application-level {@link SsoConfiguration} shape. */
function rowToSsoConfig(r: SsoConfigRow): SsoConfiguration {
  return {
    id: r.id,
    name: r.name,
    ssoStartUrl: r.sso_start_url,
    ssoRegion: r.sso_region,
    accountId: r.account_id ?? undefined,
    accountName: r.account_name ?? undefined,
    roleName: r.role_name ?? undefined,
    bedrockRegion: r.bedrock_region,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Returns all saved SSO configurations, most recently updated first. */
export function listSsoConfigs(): SsoConfiguration[] {
  const rows = db
    .prepare('SELECT * FROM sso_configs ORDER BY updated_at DESC')
    .all() as SsoConfigRow[];
  return rows.map(rowToSsoConfig);
}

/** Returns a single SSO configuration by ID, or `null` if not found. */
export function getSsoConfig(id: string): SsoConfiguration | null {
  const row = db
    .prepare('SELECT * FROM sso_configs WHERE id = ?')
    .get(id) as SsoConfigRow | undefined;
  return row ? rowToSsoConfig(row) : null;
}

/** Inserts or replaces an SSO configuration. */
export function saveSsoConfig(config: SsoConfiguration): void {
  db.prepare(
    `INSERT OR REPLACE INTO sso_configs
     (id, name, sso_start_url, sso_region, account_id, account_name, role_name, bedrock_region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    config.id,
    config.name,
    config.ssoStartUrl,
    config.ssoRegion,
    config.accountId ?? null,
    config.accountName ?? null,
    config.roleName ?? null,
    config.bedrockRegion,
    config.createdAt,
    config.updatedAt
  );
}

/** Deletes an SSO configuration by ID. */
export function deleteSsoConfig(id: string): void {
  db.prepare('DELETE FROM sso_configs WHERE id = ?').run(id);
}

// --- App Settings ---

/** Retrieves a setting value by key, or `null` if unset. */
export function getSetting(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** Inserts or updates a setting key-value pair. */
export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Permanently deletes all messages, conversations, and SSO configurations.
 * `secure_delete` is enabled globally at init, so freed pages are zeroed.
 * A final `VACUUM` rebuilds the database file, eliminating any residual
 * free-list pages that could retain deleted content (see SI-F06).
 */
export function wipeAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM conversations');
  db.exec('DELETE FROM sso_configs');
  db.exec('VACUUM');
}
