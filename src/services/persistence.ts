import * as SQLite from 'expo-sqlite';

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('fresh-pantry.db');
  }

  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

export async function readPersistedValue<T>(key: string): Promise<T | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?',
    key
  );

  if (!row) return null;
  return JSON.parse(row.value) as T;
}

export async function writePersistedValue<T>(key: string, value: T) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value),
    new Date().toISOString()
  );
}
