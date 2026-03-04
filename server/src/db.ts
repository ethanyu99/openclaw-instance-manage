import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err);
    });
  }
  return pool;
}

async function migrate() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS instances (
      id UUID PRIMARY KEY,
      owner_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      endpoint TEXT NOT NULL DEFAULT '',
      token TEXT,
      api_key TEXT,
      description TEXT DEFAULT '',
      sandbox_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY,
      owner_id VARCHAR(255) NOT NULL,
      instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_instances_owner_id ON instances(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_instance_id ON tasks(instance_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON tasks(owner_id);
  `);
  console.log('[db] Migration complete');
}

export async function initDB() {
  const p = getPool();
  await p.query('SELECT 1');
  console.log('[db] Connected to PostgreSQL');
  await migrate();
}

export async function closeDB() {
  if (pool) {
    await pool.end();
  }
}
