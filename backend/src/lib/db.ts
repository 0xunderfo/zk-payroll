import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

let pool: Pool | null = null;
const MIGRATIONS_DIR = join(process.cwd(), "src", "db", "migrations");

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set");
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: process.env.PGSSL === "disable" ? false : undefined,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [key]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    } catch {
      // Best-effort unlock on process/connection edge cases.
    }
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    if (!existsSync(MIGRATIONS_DIR)) {
      throw new Error(`Migration directory not found: ${MIGRATIONS_DIR}`);
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const applied = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations"
    );
    const appliedSet = new Set(applied.rows.map((row) => row.version));

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[db] applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`[db] migration failed (${file}): ${String(error)}`);
      }
    }
  } finally {
    client.release();
  }
}
