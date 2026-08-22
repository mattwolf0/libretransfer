import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

const migrations = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS login_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_login_sessions_token_hash ON login_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS ix_login_sessions_user_id ON login_sessions(user_id);
    CREATE INDEX IF NOT EXISTS ix_login_sessions_expires_at ON login_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      first_failed_at TEXT NOT NULL,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS storages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      allow_upload INTEGER NOT NULL DEFAULT 1,
      show_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      can_upload INTEGER NOT NULL DEFAULT 0,
      UNIQUE(storage_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS ix_storage_members_storage_id ON storage_members(storage_id);
    CREATE INDEX IF NOT EXISTS ix_storage_members_user_id ON storage_members(user_id);

    CREATE TABLE IF NOT EXISTS trash_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      old_path TEXT NOT NULL,
      trash_path TEXT NOT NULL UNIQUE,
      deleted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_trash_items_storage_id ON trash_items(storage_id);
    CREATE INDEX IF NOT EXISTS ix_trash_items_user_id ON trash_items(user_id);

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_upload_sessions_storage_id ON upload_sessions(storage_id);
    CREATE INDEX IF NOT EXISTS ix_upload_sessions_user_id ON upload_sessions(user_id);
    CREATE INDEX IF NOT EXISTS ix_upload_sessions_expires_at ON upload_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS audit_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      client_ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_audit_entries_user_id ON audit_entries(user_id);
    CREATE INDEX IF NOT EXISTS ix_audit_entries_event ON audit_entries(event);
    CREATE INDEX IF NOT EXISTS ix_audit_entries_created_at ON audit_entries(created_at);
  `,
  `
    CREATE TABLE storage_members_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      can_upload INTEGER NOT NULL DEFAULT 0,
      UNIQUE(storage_id, user_id)
    );
    INSERT INTO storage_members_v2 (id, storage_id, user_id, can_upload)
      SELECT id, storage_id, user_id, can_upload FROM storage_members;

    CREATE TABLE trash_items_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      old_path TEXT NOT NULL,
      trash_path TEXT NOT NULL UNIQUE,
      deleted_at TEXT NOT NULL
    );
    INSERT INTO trash_items_v2
      (id, storage_id, user_id, name, old_path, trash_path, deleted_at)
      SELECT id, storage_id, user_id, name, old_path, trash_path, deleted_at FROM trash_items;

    CREATE TABLE upload_sessions_v2 (
      id TEXT PRIMARY KEY,
      storage_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    INSERT INTO upload_sessions_v2
      (id, storage_id, user_id, folder_path, file_name, file_size, uploaded_size,
       created_at, updated_at, expires_at)
      SELECT id, storage_id, user_id, folder_path, file_name, file_size, uploaded_size,
             created_at, updated_at, expires_at
      FROM upload_sessions;

    DROP TABLE storage_members;
    DROP TABLE trash_items;
    DROP TABLE upload_sessions;

    ALTER TABLE storage_members_v2 RENAME TO storage_members;
    ALTER TABLE trash_items_v2 RENAME TO trash_items;
    ALTER TABLE upload_sessions_v2 RENAME TO upload_sessions;

    CREATE INDEX ix_storage_members_storage_id ON storage_members(storage_id);
    CREATE INDEX ix_storage_members_user_id ON storage_members(user_id);
    CREATE INDEX ix_trash_items_storage_id ON trash_items(storage_id);
    CREATE INDEX ix_trash_items_user_id ON trash_items(user_id);
    CREATE INDEX ix_upload_sessions_storage_id ON upload_sessions(storage_id);
    CREATE INDEX ix_upload_sessions_user_id ON upload_sessions(user_id);
    CREATE INDEX ix_upload_sessions_expires_at ON upload_sessions(expires_at);

    DROP TABLE storages;
  `,
]

export class AppDatabase {
  readonly sqlite: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.sqlite = new DatabaseSync(path)
    this.sqlite.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    )
  }

  migrate() {
    const version = Number(
      this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
    )
    for (let index = version; index < migrations.length; index += 1) {
      this.transaction(() => {
        this.sqlite.exec(migrations[index] ?? '')
        this.sqlite.exec(`PRAGMA user_version = ${index + 1}`)
      })
    }
  }

  run(sql: string, ...values: SQLInputValue[]) {
    return this.sqlite.prepare(sql).run(...values)
  }

  get<T = Record<string, unknown>>(sql: string, ...values: SQLInputValue[]) {
    return this.sqlite.prepare(sql).get(...values) as unknown as T | undefined
  }

  all<T = Record<string, unknown>>(sql: string, ...values: SQLInputValue[]) {
    return this.sqlite.prepare(sql).all(...values) as unknown as T[]
  }

  transaction<T>(work: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.sqlite.exec('COMMIT')
      return result
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  check() {
    this.get('SELECT 1 AS ok')
  }

  close() {
    this.sqlite.close()
  }
}
