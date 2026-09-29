import postgres from 'postgres';
import { databaseTLS } from './tls.mjs';
import { createDatabase, type Query } from './adapter';
let database: D1Database | undefined;
export function getPostgresDatabase(): D1Database | undefined {
  // DATABASEURL supports the existing write-only Vercel secret. Prefer DATABASE_URL.
  const url = process.env.DATABASE_URL || process.env.DATABASEURL;
  if (!url) return undefined;
  if (database) return database;
  const client = postgres(url, {
    prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10,
    ssl: databaseTLS(url),
    types: { bigint: { to: 20, from: [20], serialize: String, parse: Number } },
  });
  const run = (connection: typeof client): Query => async (sql, values) => {
    const rows = await connection.unsafe(sql, values as never[]);
    return { rows: [...rows], count: rows.count };
  };
  // A small club benefits from predictable ordered writes. The lock is shared
  // by all serverless instances and held only for a batch, never a user session.
  // Single statements also need the private schema and transaction pool safety.
  database = createDatabase(async (sql, values) => client.begin(async tx => {
    await tx.unsafe("SET LOCAL ROLE gold_gym_app");
    await tx.unsafe("SELECT set_config('app.club_owner', $1, true)", [process.env.GOLD_GYM_OWNER_ID ?? ""]);
    await tx.unsafe("SET LOCAL search_path TO club, pg_catalog");
    await tx.unsafe("SET LOCAL statement_timeout = '15s'");
    return run(tx as unknown as typeof client)(sql, values);
  }) as never, async work => client.begin(async tx => {
    await tx.unsafe("SET LOCAL ROLE gold_gym_app");
    await tx.unsafe("SELECT set_config('app.club_owner', $1, true)", [process.env.GOLD_GYM_OWNER_ID ?? ""]);
    await tx.unsafe("SET LOCAL search_path TO club, pg_catalog");
    await tx.unsafe("SET LOCAL statement_timeout = '15s'");
    await tx.unsafe('SELECT pg_advisory_xact_lock(71946201)');
    return work(run(tx as unknown as typeof client));
  }) as never);
  return database;
}
