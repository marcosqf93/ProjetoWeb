import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
export const hasDatabase = Boolean(databaseUrl && String(databaseUrl).trim());

export const pool = hasDatabase
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

export async function initDb() {
  if (!pool) return false;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id BIGSERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      image TEXT,
      video TEXT,
      link TEXT,
      source TEXT NOT NULL DEFAULT 'PODBEN',
      location TEXT NOT NULL DEFAULT 'Aquidauana/MS',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prayer_requests (
      id BIGSERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      celular TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('alpha_admin','columnist')),
      columnist_id TEXT,
      is_2fa BOOLEAN NOT NULL DEFAULT FALSE,
      provider TEXT NOT NULL DEFAULT 'password',
      photo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return true;
}
