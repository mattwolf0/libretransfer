import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, expect, it } from 'vitest'

import { AppDatabase } from '../src/database.js'

let root = ''

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('removes stored folder config without deleting linked records', async () => {
  root = await mkdtemp(join(tmpdir(), 'libretransfer-db-'))
  const path = join(root, 'old.db')
  const old = new DatabaseSync(path)
  old.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE storages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      allow_upload INTEGER NOT NULL,
      show_hidden INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE storage_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      can_upload INTEGER NOT NULL,
      UNIQUE(storage_id, user_id)
    );
    CREATE TABLE trash_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      old_path TEXT NOT NULL,
      trash_path TEXT NOT NULL UNIQUE,
      deleted_at TEXT NOT NULL
    );
    CREATE TABLE upload_sessions (
      id TEXT PRIMARY KEY,
      storage_id TEXT NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    INSERT INTO users VALUES (1, 'sam', 'hash', 'member', 1, '2026-01-01');
    INSERT INTO storages VALUES ('main', 'Files', '/files', 1, 0, '2026-01-01');
    INSERT INTO storage_members VALUES (1, 'main', 1, 0);
    INSERT INTO trash_items VALUES
      (1, 'main', 1, 'note.txt', 'note.txt', '.trash/note.txt', '2026-01-01');
    INSERT INTO upload_sessions VALUES
      ('upload', 'main', 1, '', 'file.txt', 10, 4, '2026-01-01', '2026-01-01', '2027-01-01');
    PRAGMA user_version = 1;
  `)
  old.close()

  const db = new AppDatabase(path)
  try {
    db.migrate()
    expect(
      db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'storages'"),
    ).toBeUndefined()
    expect(
      db.get<{ storage_id: string }>('SELECT storage_id FROM storage_members')?.storage_id,
    ).toBe('main')
    expect(db.get<{ storage_id: string }>('SELECT storage_id FROM trash_items')?.storage_id).toBe(
      'main',
    )
    expect(
      db.get<{ storage_id: string }>('SELECT storage_id FROM upload_sessions')?.storage_id,
    ).toBe('main')
  } finally {
    db.close()
  }
})
